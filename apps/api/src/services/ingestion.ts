import type { AgentProfile, InboundMessage, Lead, Property } from '@reap/shared';
import type { ActivityRepository } from '../repositories/activities.js';
import type { AuditRepository } from '../repositories/audit.js';
import type { LeadRepository } from '../repositories/leads.js';
import type { PropertyRepository } from '../repositories/properties.js';
import type { Classifier } from './classifier/index.js';
import type { InboxProvider } from './inbox/types.js';
import { buildSuggestion } from './suggestions.js';
import { logger } from '../logger.js';

export interface IngestionOptions {
  inbox: InboxProvider;
  classifier: Classifier;
  activities: ActivityRepository;
  leads: LeadRepository;
  properties: PropertyRepository;
  audit: AuditRepository;
  agent: AgentProfile;
  pollIntervalMs: number;
  maxResults: number;
}

export interface IngestionResult {
  fetched: number;
  created: number;
  skipped: number;
}

/**
 * Turns inbound mail into pending approval requests.
 *
 * The loop is deliberately conservative: it classifies, drafts, and files for
 * review. It never sends, never advances a lead, and never generates a document
 * on its own. Every outward-facing effect is gated behind an explicit human
 * approval in ActivityService.
 */
export class IngestionService {
  private timer: NodeJS.Timeout | null = null;
  private lastPolledAt: Date | null = null;
  private polling = false;
  /** Guards against overlapping runs when a poll outlives its interval. */
  private inFlight = false;

  constructor(private readonly options: IngestionOptions) {}

  get providerName(): string {
    return this.options.inbox.name;
  }

  get isPolling(): boolean {
    return this.polling;
  }

  get lastPollIso(): string | null {
    return this.lastPolledAt?.toISOString() ?? null;
  }

  start(): void {
    if (this.polling) return;
    this.polling = true;

    // Prime immediately so a fresh start has data before the first interval.
    void this.pollOnce();

    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.options.pollIntervalMs);

    // Do not hold the event loop open purely to poll.
    this.timer.unref?.();

    logger.info(
      `[ingestion] polling "${this.options.inbox.name}" every ` +
        `${Math.round(this.options.pollIntervalMs / 1000)}s`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.polling = false;
    logger.info('[ingestion] stopped');
  }

  /** One pass over the inbox. Safe to call directly; used by tests and seeds. */
  async pollOnce(): Promise<IngestionResult> {
    if (this.inFlight) {
      return { fetched: 0, created: 0, skipped: 0 };
    }
    this.inFlight = true;

    try {
      const messages = await this.options.inbox.fetchRecent({
        since: this.lastPolledAt,
        limit: this.options.maxResults,
      });

      let created = 0;
      let skipped = 0;

      for (const message of messages) {
        const activity = await this.ingest(message);
        if (activity) created += 1;
        else skipped += 1;
      }

      this.lastPolledAt = new Date();

      if (created > 0) {
        logger.info(`[ingestion] ${created} new activit${created === 1 ? 'y' : 'ies'}`);
      }

      return { fetched: messages.length, created, skipped };
    } catch (error) {
      // A provider outage must not kill the interval; the next tick retries.
      logger.error('[ingestion] poll failed:', (error as Error).message);
      return { fetched: 0, created: 0, skipped: 0 };
    } finally {
      this.inFlight = false;
    }
  }

  /** Classifies one message and files it for review. Null if already ingested. */
  private async ingest(message: InboundMessage) {
    if (this.options.activities.existsByExternalId(message.externalId)) {
      return null;
    }

    const classification = await this.options.classifier.classify(message);

    const lead = this.options.leads.findByEmail(message.fromEmail);
    const property = this.matchProperty(message, lead);

    const suggestion = buildSuggestion({
      message,
      classification,
      agent: this.options.agent,
      lead,
      property,
    });

    const activity = this.options.activities.create({
      message,
      classification,
      rationale: suggestion.rationale,
      proposedActions: suggestion.proposedActions,
      draft: suggestion.draft,
      leadId: lead?.id ?? null,
      propertyId: property?.id ?? null,
    });

    if (!activity) return null;

    this.options.audit.record({
      actor: 'system',
      action: 'activity.created',
      subjectType: 'activity',
      subjectId: activity.id,
      summary:
        `Classified "${message.subject}" from ${message.fromEmail} as ` +
        `${classification.intent} (${classification.confidence}% confidence)`,
      detail: {
        classifier: classification.classifier,
        signals: classification.signals,
        drafted: suggestion.draft !== null,
      },
    });

    return activity;
  }

  /**
   * Associates a message with a listing.
   *
   * Prefers an address mentioned in the subject or body; falls back to the
   * property already attached to the sender's lead record. Returns null rather
   * than guessing when neither applies, since a wrong listing in a draft reply
   * is worse than no listing at all.
   */
  private matchProperty(message: InboundMessage, lead: Lead | null): Property | null {
    const haystack = `${message.subject} ${message.body}`.toLowerCase();

    // Scanning every listing is fine at this scale; a larger deployment would
    // move this to a full-text index on the address column.
    const { items } = this.options.properties.list({ limit: 200, offset: 0 });

    const mentioned = items.find((property) =>
      haystack.includes(property.address.toLowerCase()),
    );
    if (mentioned) return mentioned;

    if (lead?.propertyId) {
      return this.options.properties.findById(lead.propertyId);
    }

    return null;
  }
}
