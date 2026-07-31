import type { DraftEmail } from '@reap/shared';
import { logger } from '../logger.js';

export interface SentMessage extends DraftEmail {
  sentAt: string;
}

/**
 * Outbound delivery.
 *
 * Separated behind an interface so approval can be exercised end to end in
 * tests without an SMTP server, and so a deployment can swap in SES or
 * Postmark without touching ActivityService.
 */
export interface Mailer {
  readonly name: string;
  send(draft: DraftEmail): Promise<SentMessage>;
}

/**
 * Records what would have been sent and logs it.
 *
 * This is the default. Shipping a portfolio application that can email real
 * strangers if someone sets the wrong environment variable is not a trade worth
 * making, so real delivery is opt-in rather than the fallback.
 */
export class ConsoleMailer implements Mailer {
  readonly name = 'console';

  private readonly outbox: SentMessage[] = [];

  async send(draft: DraftEmail): Promise<SentMessage> {
    const sent: SentMessage = { ...draft, sentAt: new Date().toISOString() };
    this.outbox.push(sent);

    logger.info(
      `[mailer] (not actually sent) to=${draft.to} subject="${draft.subject}"` +
        (draft.attachments.length > 0
          ? ` attachments=${draft.attachments.length}`
          : ''),
    );

    return sent;
  }

  /** Everything this mailer has "sent". Used by tests. */
  get sent(): readonly SentMessage[] {
    return this.outbox;
  }
}
