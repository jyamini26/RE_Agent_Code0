import type {
  RiskFinding,
  Activity,
  ActivityStatus,
  Classification,
  DraftEmail,
  InboundMessage,
  Intent,
} from '@reap/shared';
import type { Db } from '../db/index.js';
import { decodeJson, encodeJson, generateId, nowIso } from '../db/index.js';

interface ActivityRow {
  id: string;
  status: string;
  external_id: string;
  from_name: string;
  from_email: string;
  subject: string;
  body: string;
  received_at: string;
  intent: string;
  sentiment: number;
  confidence: number;
  classifier: string;
  signals: string;
  rationale: string;
  proposed_actions: string;
  draft: string | null;
  lead_id: string | null;
  property_id: string | null;
  created_at: string;
  resolved_at: string | null;
  error: string | null;
  risk: string;
}

function toDomain(row: ActivityRow): Activity {
  return {
    id: row.id,
    status: row.status as ActivityStatus,
    message: {
      externalId: row.external_id,
      fromName: row.from_name,
      fromEmail: row.from_email,
      subject: row.subject,
      body: row.body,
      receivedAt: row.received_at,
    },
    classification: {
      intent: row.intent as Intent,
      sentiment: row.sentiment,
      confidence: row.confidence,
      classifier: row.classifier,
      signals: decodeJson<string[]>(row.signals, []),
    },
    rationale: decodeJson<string[]>(row.rationale, []),
    proposedActions: decodeJson<string[]>(row.proposed_actions, []),
    draft: decodeJson<DraftEmail | null>(row.draft, null),
    leadId: row.lead_id,
    propertyId: row.property_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    error: row.error,
    risk: decodeJson<Activity['risk']>(row.risk ?? '[]', []),
  };
}

export interface CreateActivityInput {
  message: InboundMessage;
  classification: Classification;
  rationale: string[];
  proposedActions: string[];
  draft: DraftEmail | null;
  leadId: string | null;
  propertyId: string | null;
  /** Guard findings, if a guard is installed. */
  risk?: RiskFinding[];
}

export class ActivityRepository {
  constructor(private readonly db: Db) {}

  list(options: { status?: ActivityStatus; limit: number; offset: number }): {
    items: Activity[];
    total: number;
  } {
    const { status, limit, offset } = options;
    const where = status ? 'WHERE status = @status' : '';
    const params = { status, limit, offset };

    const total = this.db
      .prepare<typeof params, { count: number }>(
        `SELECT COUNT(*) AS count FROM activities ${where}`,
      )
      .get(params);

    const rows = this.db
      .prepare<typeof params, ActivityRow>(
        `SELECT * FROM activities ${where}
         ORDER BY created_at DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(params);

    return { items: rows.map(toDomain), total: total?.count ?? 0 };
  }

  findById(id: string): Activity | null {
    const row = this.db
      .prepare<{ id: string }, ActivityRow>('SELECT * FROM activities WHERE id = @id')
      .get({ id });
    return row ? toDomain(row) : null;
  }

  existsByExternalId(externalId: string): boolean {
    const row = this.db
      .prepare<{ externalId: string }, { id: string }>(
        'SELECT id FROM activities WHERE external_id = @externalId',
      )
      .get({ externalId });
    return row != null;
  }

  /**
   * Inserts an activity, ignoring messages already ingested.
   *
   * Idempotency is enforced by the UNIQUE constraint on external_id rather than
   * a read-then-write, so concurrent polls cannot race into a duplicate.
   * Returns null when the message was already known.
   */
  create(input: CreateActivityInput): Activity | null {
    const activity: Activity = {
      id: generateId('act'),
      status: 'pending',
      message: input.message,
      classification: input.classification,
      rationale: input.rationale,
      proposedActions: input.proposedActions,
      draft: input.draft,
      leadId: input.leadId,
      propertyId: input.propertyId,
      createdAt: nowIso(),
      resolvedAt: null,
      error: null,
      risk: input.risk ?? [],
    };
    // A critical guard finding parks the item instead of queueing it for a
    // routine one-click approval.
    if (activity.risk.some((f) => f.level === 'critical')) {
      activity.status = 'held';
    }

    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO activities (
           id, status, external_id, from_name, from_email, subject, body, received_at,
           intent, sentiment, confidence, classifier, signals,
           rationale, proposed_actions, draft, lead_id, property_id,
           created_at, resolved_at, error, risk
         ) VALUES (
           @id, @status, @externalId, @fromName, @fromEmail, @subject, @body, @receivedAt,
           @intent, @sentiment, @confidence, @classifier, @signals,
           @rationale, @proposedActions, @draft, @leadId, @propertyId,
           @createdAt, @resolvedAt, @error, @risk
         )`,
      )
      .run({
        id: activity.id,
        status: activity.status,
        externalId: activity.message.externalId,
        fromName: activity.message.fromName,
        fromEmail: activity.message.fromEmail,
        subject: activity.message.subject,
        body: activity.message.body,
        receivedAt: activity.message.receivedAt,
        intent: activity.classification.intent,
        sentiment: activity.classification.sentiment,
        confidence: activity.classification.confidence,
        classifier: activity.classification.classifier,
        signals: encodeJson(activity.classification.signals),
        rationale: encodeJson(activity.rationale),
        proposedActions: encodeJson(activity.proposedActions),
        draft: activity.draft ? encodeJson(activity.draft) : null,
        leadId: activity.leadId,
        propertyId: activity.propertyId,
        createdAt: activity.createdAt,
        risk: encodeJson(activity.risk),
        resolvedAt: activity.resolvedAt,
        error: activity.error,
      });

    return result.changes === 0 ? null : activity;
  }

  /** Replaces the draft on a pending activity. */
  updateDraft(id: string, draft: DraftEmail): Activity | null {
    this.db
      .prepare('UPDATE activities SET draft = @draft WHERE id = @id')
      .run({ id, draft: encodeJson(draft) });
    return this.findById(id);
  }

  setStatus(
    id: string,
    status: ActivityStatus,
    options: { error?: string | null } = {},
  ): Activity | null {
    this.db
      .prepare(
        `UPDATE activities
         SET status = @status, resolved_at = @resolvedAt, error = @error
         WHERE id = @id`,
      )
      .run({
        id,
        status,
        // A pending activity has not been resolved; anything else has.
        resolvedAt: status === 'pending' ? null : nowIso(),
        error: options.error ?? null,
      });
    return this.findById(id);
  }

  countByStatus(status: ActivityStatus): number {
    const row = this.db
      .prepare<{ status: string }, { count: number }>(
        'SELECT COUNT(*) AS count FROM activities WHERE status = @status',
      )
      .get({ status });
    return row?.count ?? 0;
  }

  count(): number {
    const row = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM activities')
      .get();
    return row?.count ?? 0;
  }
}
