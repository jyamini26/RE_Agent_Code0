import type { AuditAction, AuditEntry } from '@reap/shared';
import type { Db } from '../db/index.js';
import { decodeJson, encodeJson, generateId, nowIso } from '../db/index.js';

interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  subject_type: string;
  subject_id: string;
  summary: string;
  detail: string | null;
}

function toDomain(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor as AuditEntry['actor'],
    action: row.action as AuditAction,
    subjectType: row.subject_type as AuditEntry['subjectType'],
    subjectId: row.subject_id,
    summary: row.summary,
    detail: decodeJson<Record<string, unknown> | null>(row.detail, null),
  };
}

export interface RecordAuditInput {
  actor: AuditEntry['actor'];
  action: AuditAction;
  subjectType: AuditEntry['subjectType'];
  subjectId: string;
  summary: string;
  detail?: Record<string, unknown> | null;
}

/**
 * Append-only log of every decision, human or automated.
 *
 * There is deliberately no update or delete method. An AI that drafts client
 * communication on a licensed agent's behalf is only defensible if the record
 * of what it proposed, what the human changed, and what was ultimately sent
 * cannot be rewritten after the fact.
 */
export class AuditRepository {
  constructor(private readonly db: Db) {}

  record(input: RecordAuditInput): AuditEntry {
    const entry: AuditEntry = {
      id: generateId('audit'),
      at: nowIso(),
      actor: input.actor,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      summary: input.summary,
      detail: input.detail ?? null,
    };

    this.db
      .prepare(
        `INSERT INTO audit_entries (
           id, at, actor, action, subject_type, subject_id, summary, detail
         ) VALUES (
           @id, @at, @actor, @action, @subjectType, @subjectId, @summary, @detail
         )`,
      )
      .run({
        ...entry,
        detail: entry.detail ? encodeJson(entry.detail) : null,
      });

    return entry;
  }

  list(options: { subjectId?: string; limit: number; offset: number }): {
    items: AuditEntry[];
    total: number;
  } {
    const { subjectId, limit, offset } = options;
    const where = subjectId ? 'WHERE subject_id = @subjectId' : '';
    const params = { subjectId, limit, offset };

    const total = this.db
      .prepare<typeof params, { count: number }>(
        `SELECT COUNT(*) AS count FROM audit_entries ${where}`,
      )
      .get(params);

    const rows = this.db
      .prepare<typeof params, AuditRow>(
        `SELECT * FROM audit_entries ${where}
         ORDER BY at DESC, rowid DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(params);

    return { items: rows.map(toDomain), total: total?.count ?? 0 };
  }
}
