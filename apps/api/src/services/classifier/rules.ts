import type { Classification, InboundMessage, Intent } from '@reap/shared';
import type { Classifier } from './types.js';

interface IntentRule {
  /** Phrases that indicate this intent. Matched case-insensitively. */
  keywords: readonly string[];
  /** Baseline sentiment 0-100 when this intent wins. */
  sentiment: number;
  /**
   * Tie-break order. When two intents match the same number of keywords the
   * higher priority wins, so "urgent problem with the offer" routes to `issue`
   * rather than `offer`.
   */
  priority: number;
}

/**
 * Keyed by Intent minus `unknown`, which is the fallback rather than a rule.
 * `satisfies` makes an unhandled intent a compile error.
 */
const RULES = {
  issue: {
    keywords: [
      'problem',
      'concern',
      'urgent',
      'asap',
      'immediately',
      'complaint',
      'disappointed',
      'unacceptable',
      'frustrated',
      'cancel',
      'terminate',
    ],
    sentiment: 25,
    priority: 6,
  },
  offer: {
    keywords: [
      'offer',
      'submit an offer',
      'make an offer',
      'counter',
      'earnest money',
      'purchase agreement',
      'escrow',
      'contingency',
      'bid',
    ],
    sentiment: 90,
    priority: 5,
  },
  showing_request: {
    keywords: [
      'showing',
      'tour',
      'walk through',
      'walkthrough',
      'see the property',
      'open house',
      'visit',
      'schedule a time',
      'available to show',
      'viewing',
    ],
    sentiment: 85,
    priority: 4,
  },
  new_lead: {
    keywords: [
      'looking for',
      'want to buy',
      'in the market',
      'relocating',
      'pre-approved',
      'preapproved',
      'thinking of selling',
      'list my home',
      'work with an agent',
      'referred me',
      'got your name',
    ],
    sentiment: 80,
    priority: 3,
  },
  follow_up: {
    keywords: [
      'checking in',
      'following up',
      'any news',
      'any update',
      'status',
      'circling back',
      'touching base',
      'heard anything',
      'still waiting',
    ],
    sentiment: 55,
    priority: 2,
  },
  inquiry: {
    keywords: [
      'question',
      'curious',
      'interested',
      'how much',
      'what is the',
      'price',
      'square footage',
      'hoa',
      'taxes',
      'schools',
      'parking',
      'can you tell me',
    ],
    sentiment: 70,
    priority: 1,
  },
} as const satisfies Record<Exclude<Intent, 'unknown'>, IntentRule>;

/** Words that push sentiment down regardless of which intent wins. */
const NEGATIVE_MARKERS = [
  'not happy',
  'no longer',
  'waste',
  'rude',
  'ignored',
  'worst',
  'never heard back',
] as const;

/** Words that push sentiment up. */
const POSITIVE_MARKERS = [
  'thank you',
  'thanks',
  'excited',
  'love',
  'beautiful',
  'perfect',
  'appreciate',
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic keyword classifier.
 *
 * Chosen as the default so the application runs offline with no API key and so
 * tests assert on fixed output. It is intentionally simple; the Anthropic
 * classifier behind the same interface is the production path.
 */
export class RulesClassifier implements Classifier {
  readonly name = 'rules-v1';

  async classify(message: InboundMessage): Promise<Classification> {
    const haystack = `${message.subject}\n${message.body}`.toLowerCase();

    const matched = new Set<string>();
    let winner: Exclude<Intent, 'unknown'> | null = null;
    let bestScore = 0;
    let bestPriority = -1;

    for (const [intent, rule] of Object.entries(RULES) as [
      Exclude<Intent, 'unknown'>,
      IntentRule,
    ][]) {
      const hits = rule.keywords.filter((keyword) => haystack.includes(keyword));
      if (hits.length === 0) continue;

      hits.forEach((hit) => matched.add(hit));

      const beatsScore = hits.length > bestScore;
      const tiesScoreButHigherPriority =
        hits.length === bestScore && rule.priority > bestPriority;

      if (beatsScore || tiesScoreButHigherPriority) {
        winner = intent;
        bestScore = hits.length;
        bestPriority = rule.priority;
      }
    }

    if (!winner) {
      return {
        intent: 'unknown',
        sentiment: 50,
        confidence: 20,
        classifier: this.name,
        signals: [],
      };
    }

    const rule = RULES[winner];

    const negatives = NEGATIVE_MARKERS.filter((m) => haystack.includes(m)).length;
    const positives = POSITIVE_MARKERS.filter((m) => haystack.includes(m)).length;
    const sentiment = clamp(rule.sentiment - negatives * 15 + positives * 5, 0, 100);

    // Confidence grows with corroborating keywords but never reaches certainty:
    // a keyword classifier should not claim it is sure.
    const confidence = clamp(45 + bestScore * 12, 0, 92);

    return {
      intent: winner,
      sentiment,
      confidence,
      classifier: this.name,
      signals: [...matched].slice(0, 20),
    };
  }
}
