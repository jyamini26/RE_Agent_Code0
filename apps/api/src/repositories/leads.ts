import type {
  CreateLeadInput,
  Lead,
  LeadSide,
  LeadStage,
  LeadTemperature,
  PipelineSummary,
  UpdateLeadInput,
} from '@reap/shared';
import { LEAD_STAGES } from '@reap/shared';
import type { Db } from '../db/index.js';
import { generateId, nowIso } from '../db/index.js';

interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  side: string;
  stage: string;
  temperature: string;
  source: string | null;
  property_id: string | null;
  budget_min: number | null;
  budget_max: number | null;
  notes: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    side: row.side as LeadSide,
    stage: row.stage as LeadStage,
    temperature: row.temperature as LeadTemperature,
    source: row.source,
    propertyId: row.property_id,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    notes: row.notes,
    lastContactAt: row.last_contact_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LeadRepository {
  constructor(private readonly db: Db) {}

  list(options: { stage?: LeadStage; limit: number; offset: number }): {
    items: Lead[];
    total: number;
  } {
    const { stage, limit, offset } = options;
    const where = stage ? 'WHERE stage = @stage' : '';
    const params = { stage, limit, offset };

    const total = this.db
      .prepare<typeof params, { count: number }>(
        `SELECT COUNT(*) AS count FROM leads ${where}`,
      )
      .get(params);

    const rows = this.db
      .prepare<typeof params, LeadRow>(
        `SELECT * FROM leads ${where}
         ORDER BY COALESCE(last_contact_at, created_at) DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(params);

    return { items: rows.map(toDomain), total: total?.count ?? 0 };
  }

  findById(id: string): Lead | null {
    const row = this.db
      .prepare<{ id: string }, LeadRow>('SELECT * FROM leads WHERE id = @id')
      .get({ id });
    return row ? toDomain(row) : null;
  }

  /** Used to attach an inbound email to an existing lead rather than duplicating. */
  findByEmail(email: string): Lead | null {
    const row = this.db
      .prepare<{ email: string }, LeadRow>(
        'SELECT * FROM leads WHERE lower(email) = lower(@email) LIMIT 1',
      )
      .get({ email });
    return row ? toDomain(row) : null;
  }

  create(input: CreateLeadInput): Lead {
    const now = nowIso();
    const lead: Lead = {
      id: generateId('lead'),
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      side: input.side,
      stage: input.stage ?? 'new',
      temperature: input.temperature ?? 'warm',
      source: input.source ?? null,
      propertyId: input.propertyId ?? null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      notes: input.notes ?? null,
      lastContactAt: input.lastContactAt ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO leads (
           id, name, email, phone, side, stage, temperature, source, property_id,
           budget_min, budget_max, notes, last_contact_at, created_at, updated_at
         ) VALUES (
           @id, @name, @email, @phone, @side, @stage, @temperature, @source, @propertyId,
           @budgetMin, @budgetMax, @notes, @lastContactAt, @createdAt, @updatedAt
         )`,
      )
      .run(lead);

    return lead;
  }

  update(id: string, patch: UpdateLeadInput): Lead | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const merged: Lead = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    };

    this.db
      .prepare(
        `UPDATE leads SET
           name = @name, email = @email, phone = @phone, side = @side,
           stage = @stage, temperature = @temperature, source = @source,
           property_id = @propertyId, budget_min = @budgetMin, budget_max = @budgetMax,
           notes = @notes, last_contact_at = @lastContactAt, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run(merged);

    return merged;
  }

  touchContact(id: string, at: string = nowIso()): void {
    this.db
      .prepare(
        'UPDATE leads SET last_contact_at = @at, updated_at = @at WHERE id = @id',
      )
      .run({ id, at });
  }

  /**
   * Board header counts. Computed in SQL so the pipeline view stays a single
   * round trip regardless of how many leads exist.
   */
  pipelineSummary(): PipelineSummary {
    const rows = this.db
      .prepare<[], { stage: string; count: number; value: number | null }>(
        `SELECT stage,
                COUNT(*)                     AS count,
                SUM(COALESCE(budget_max, 0)) AS value
         FROM leads
         GROUP BY stage`,
      )
      .all();

    const byStage = new Map(rows.map((row) => [row.stage, row]));

    return {
      // Iterate the canonical order so empty stages still render a column.
      stages: LEAD_STAGES.map((stage) => {
        const row = byStage.get(stage);
        return {
          stage,
          count: row?.count ?? 0,
          valueUsd: Math.round(row?.value ?? 0),
        };
      }),
      totalLeads: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }

  count(): number {
    const row = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM leads')
      .get();
    return row?.count ?? 0;
  }
}
