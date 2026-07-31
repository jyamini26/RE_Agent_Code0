import type { InboundMessage } from '@reap/shared';

/**
 * Strategy interface for reading an agent's inbox.
 *
 * Ingestion depends only on this, which is what lets the repository ship with a
 * zero-credential default: `SimulatedInboxProvider` replays a fixture set and
 * `GmailInboxProvider` polls a real mailbox, and the pipeline cannot tell them
 * apart.
 */
export interface InboxProvider {
  /** Stable identifier surfaced on the health endpoint. */
  readonly name: string;

  /**
   * Returns messages received since `since`, newest first.
   *
   * Implementations may return messages already seen; deduplication is the
   * caller's responsibility via the UNIQUE constraint on external_id.
   */
  fetchRecent(options: {
    since: Date | null;
    limit: number;
  }): Promise<InboundMessage[]>;
}
