import type { Classification, InboundMessage } from '@reap/shared';
import { INTENTS, classificationSchema } from '@reap/shared';
import type { Classifier } from './types.js';
import { logger } from '../../logger.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Tool schema for structured extraction.
 *
 * Forcing a tool call rather than parsing free text means the model cannot
 * return prose that fails validation, and the enum constrains `intent` to the
 * same union the rest of the system uses.
 */
const CLASSIFY_TOOL = {
  name: 'record_classification',
  description: 'Record the classification of an inbound real estate email.',
  input_schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: [...INTENTS],
        description: 'The primary intent of the sender.',
      },
      sentiment: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Sender sentiment. 0 is hostile, 50 neutral, 100 delighted.',
      },
      confidence: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'How confident you are in the intent label.',
      },
      signals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short phrases from the email that justify the label.',
      },
    },
    required: ['intent', 'sentiment', 'confidence', 'signals'],
  },
} as const;

const SYSTEM_PROMPT = `You classify inbound email sent to a residential real estate agent.

Read the message and record exactly one intent using the record_classification tool.

Intent definitions:
- inquiry: asks questions about a specific property or listing detail
- new_lead: a new prospect introducing themselves or describing what they want
- showing_request: wants to see a property in person, or to schedule a time
- offer: concerns an offer, counter, escrow, or contract terms
- issue: a complaint, urgent problem, or relationship risk
- follow_up: checking on the status of something already in motion
- unknown: none of the above, or too ambiguous to label

Prefer 'issue' when a message is both urgent-negative and something else.
Report honest confidence; do not inflate it.`;

interface AnthropicToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

interface AnthropicContentBlock {
  type: string;
  [key: string]: unknown;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
}

export interface AnthropicClassifierOptions {
  apiKey: string;
  model: string;
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Used when the API is unreachable or returns something unusable. */
  fallback: Classifier;
}

/**
 * LLM-backed classifier.
 *
 * Falls back to the injected classifier on any failure rather than throwing:
 * a classification outage should degrade the quality of a suggestion, not stop
 * the agent's inbox from being processed at all.
 */
export class AnthropicClassifier implements Classifier {
  readonly name: string;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly fallback: Classifier;

  constructor(options: AnthropicClassifierOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fallback = options.fallback;
    this.name = `anthropic:${options.model}`;
  }

  async classify(message: InboundMessage): Promise<Classification> {
    try {
      const raw = await this.callApi(message);
      const parsed = classificationSchema.safeParse({
        ...raw,
        classifier: this.name,
      });

      if (parsed.success) return parsed.data;

      logger.warn(
        '[classifier] Anthropic returned an unparseable classification, ' +
          `falling back to ${this.fallback.name}`,
      );
    } catch (error) {
      logger.warn(
        `[classifier] Anthropic call failed (${(error as Error).message}), ` +
          `falling back to ${this.fallback.name}`,
      );
    }

    return this.fallback.classify(message);
  }

  private async callApi(message: InboundMessage): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(ANTHROPIC_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          tools: [CLASSIFY_TOOL],
          // Forcing the tool guarantees a structured block in the response.
          tool_choice: { type: 'tool', name: CLASSIFY_TOOL.name },
          messages: [
            {
              role: 'user',
              content:
                `From: ${message.fromName} <${message.fromEmail}>\n` +
                `Subject: ${message.subject}\n\n${message.body}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as AnthropicResponse;
      const toolUse = payload.content?.find(
        (block): block is AnthropicContentBlock & AnthropicToolUseBlock =>
          block.type === 'tool_use' && block['name'] === CLASSIFY_TOOL.name,
      );

      if (!toolUse) {
        throw new Error('response contained no tool_use block');
      }

      return toolUse.input as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }
}
