import type { DraftEmail, InboundMessage, RiskFinding } from '@reap/shared';

/**
 * The guard layer.
 *
 * The classifier answers "what is this message?". A guard answers a different
 * and more consequential question: "what goes wrong if the agent acts on it?"
 *
 * Guards are optional. With none installed the platform behaves exactly as it
 * always has, which keeps the open-source core standalone. Installing one adds
 * protection without changing existing behaviour, because a guard can only add
 * findings and hold an item. It can never send, alter a draft, or approve.
 */
export interface GuardContext {
  knownDomains: readonly string[];
  firstTimeSender: boolean;
  previouslyStatedAccount?: string;
}

export interface GuardVerdict {
  /** True when the item must not be approved in one click. */
  hold: boolean;
  findings: RiskFinding[];
}

export interface Guard {
  readonly name: string;
  inspectInbound(message: InboundMessage, context: GuardContext): GuardVerdict;
  inspectDraft(draft: DraftEmail): GuardVerdict;
}

export const NO_FINDINGS: GuardVerdict = { hold: false, findings: [] };
