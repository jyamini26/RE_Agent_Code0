import type { Classification, InboundMessage } from '@reap/shared';

/**
 * Strategy interface for intent detection.
 *
 * The rest of the pipeline depends only on this contract, so the deterministic
 * keyword classifier used in tests and the LLM-backed one used in production
 * are interchangeable without touching the ingestion or suggestion code.
 */
export interface Classifier {
  /** Stable identifier recorded on every activity for auditability. */
  readonly name: string;
  classify(message: InboundMessage): Promise<Classification>;
}
