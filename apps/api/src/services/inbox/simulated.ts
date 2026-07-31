import type { InboundMessage } from '@reap/shared';
import type { Fixture } from './fixtures.js';
import { INBOX_FIXTURES } from './fixtures.js';
import type { InboxProvider } from './types.js';

/**
 * Replays a fixed set of inbound messages.
 *
 * This is the default provider so that `git clone && npm install && npm run
 * dev` produces a populated, working dashboard with no Google Cloud project,
 * no OAuth consent screen, and no credentials on disk. Timestamps are computed
 * relative to process start, so the feed always looks recent.
 */
export class SimulatedInboxProvider implements InboxProvider {
  readonly name = 'simulated';

  private readonly fixtures: readonly Fixture[];
  private readonly baseTime: Date;

  constructor(options: { fixtures?: readonly Fixture[]; now?: Date } = {}) {
    this.fixtures = options.fixtures ?? INBOX_FIXTURES;
    this.baseTime = options.now ?? new Date();
  }

  async fetchRecent(options: {
    since: Date | null;
    limit: number;
  }): Promise<InboundMessage[]> {
    const { since, limit } = options;

    return this.fixtures
      .map((fixture) => this.toMessage(fixture))
      .filter((message) =>
        since ? new Date(message.receivedAt).getTime() > since.getTime() : true,
      )
      .sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
      )
      .slice(0, limit);
  }

  /** Exposed so the seeder can resolve fixture-to-listing associations. */
  fixtureFor(externalId: string): Fixture | undefined {
    return this.fixtures.find((fixture) => fixture.externalId === externalId);
  }

  private toMessage(fixture: Fixture): InboundMessage {
    const receivedAt = new Date(
      this.baseTime.getTime() - fixture.receivedMinutesAgo * 60_000,
    );

    return {
      externalId: fixture.externalId,
      fromName: fixture.fromName,
      fromEmail: fixture.fromEmail,
      subject: fixture.subject,
      body: fixture.body,
      receivedAt: receivedAt.toISOString(),
    };
  }
}
