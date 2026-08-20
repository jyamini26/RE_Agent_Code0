import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Harness } from './harness.js';
import { createHarness } from './harness.js';
import type { Guard } from '../services/guard/index.js';

/**
 * The guard contract, exercised through the HTTP surface.
 *
 * A stub guard rather than the real Pro one: the core must not depend on a
 * private package to prove its own behaviour, and what is under test here is
 * the platform's handling of a verdict, not the quality of any particular
 * detection.
 */
const holdingGuard: Guard = {
  name: 'test-guard',
  inspectInbound(message) {
    if (!message.subject.toLowerCase().includes('wiring')) {
      return { hold: false, findings: [] };
    }
    return {
      hold: true,
      findings: [
        {
          id: 'test.wire',
          level: 'critical',
          title: 'Possible wire fraud attempt',
          detail: 'Sender domain does not match a known party.',
          guidance: 'Telephone the party on a number you already had.',
          source: 'test',
          citation: null,
        },
      ],
    };
  },
  inspectDraft(draft) {
    if (!draft.body.includes('no children')) return { hold: false, findings: [] };
    return {
      hold: true,
      findings: [
        {
          id: 'test.familial',
          level: 'critical',
          title: 'Fair housing violation',
          detail: '"no children" excludes a protected class.',
          guidance: 'Remove the restriction.',
          source: 'test',
          citation: '42 U.S.C. 3604(c)',
        },
      ],
    };
  },
};

describe('guard: inbound', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness({ guard: holdingGuard });
    await harness.container.services.ingestion.pollOnce();
  });

  it('holds a dangerous message instead of queueing it', async () => {
    const res = await request(harness.app).get('/api/activities?status=held');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].message.subject).toMatch(/wiring/i);
  });

  it('attaches the findings so the agent is told why', async () => {
    const res = await request(harness.app).get('/api/activities?status=held');
    const [held] = res.body.data;
    expect(held.risk).toHaveLength(1);
    expect(held.risk[0].level).toBe('critical');
    expect(held.risk[0].guidance).toMatch(/telephone/i);
  });

  it('keeps the held item out of the ordinary queue', async () => {
    const res = await request(harness.app).get('/api/activities?status=pending');
    expect(res.body.data.every((a: { status: string }) => a.status === 'pending')).toBe(
      true,
    );
    expect(
      res.body.data.some((a: { message: { subject: string } }) =>
        /wiring/i.test(a.message.subject),
      ),
    ).toBe(false);
  });

  it('records the hold in the ledger with its reason', async () => {
    const res = await request(harness.app).get('/api/audit?limit=100');
    const held = res.body.data.filter(
      (e: { action: string }) => e.action === 'activity.held',
    );
    expect(held.length).toBeGreaterThan(0);
    expect(held[0].summary).toMatch(/wire fraud/i);
  });

  it('leaves everything else untouched', async () => {
    const res = await request(harness.app).get('/api/activities?status=pending');
    expect(res.body.data.every((a: { risk: unknown[] }) => a.risk.length === 0)).toBe(
      true,
    );
  });
});

describe('guard: outbound', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness({ guard: holdingGuard });
    await harness.container.services.ingestion.pollOnce();
  });

  async function firstDraftable(): Promise<string> {
    const res = await request(harness.app).get('/api/activities?status=pending');
    const found = res.body.data.find((a: { draft: unknown }) => a.draft !== null);
    return found.id as string;
  }

  it('refuses to send copy that violates fair housing', async () => {
    const id = await firstDraftable();
    await request(harness.app)
      .post(`/api/activities/${id}/modify`)
      .send({ draft: { body: 'Quiet building, no children please.' } })
      .expect(200);

    const res = await request(harness.app).post(`/api/activities/${id}/approve`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('draft_blocked');
    expect(res.body.error.findings[0].citation).toMatch(/3604/);
  });

  it('leaves the activity actionable so the agent can fix it', async () => {
    const id = await firstDraftable();
    await request(harness.app)
      .post(`/api/activities/${id}/modify`)
      .send({ draft: { body: 'no children' } });
    await request(harness.app).post(`/api/activities/${id}/approve`).expect(422);

    const after = await request(harness.app).get(`/api/activities/${id}`);
    expect(after.body.data.status).toBe('pending');
  });

  it('sends nothing when the draft is refused', async () => {
    const id = await firstDraftable();
    const before = harness.mailer.sent.length;
    await request(harness.app)
      .post(`/api/activities/${id}/modify`)
      .send({ draft: { body: 'no children' } });
    await request(harness.app).post(`/api/activities/${id}/approve`).expect(422);

    expect(harness.mailer.sent).toHaveLength(before);
  });

  it('sends normally once the wording is corrected', async () => {
    const id = await firstDraftable();
    await request(harness.app)
      .post(`/api/activities/${id}/modify`)
      .send({ draft: { body: 'Quiet building with a two-bedroom layout.' } });

    await request(harness.app).post(`/api/activities/${id}/approve`).expect(200);
    expect(harness.mailer.sent.length).toBeGreaterThan(0);
  });
});

describe('no guard installed', () => {
  it('behaves exactly as the standalone platform does', async () => {
    const harness = createHarness();
    await harness.container.services.ingestion.pollOnce();

    const res = await request(harness.app).get('/api/activities?status=held');
    expect(res.body.meta.total).toBe(0);
  });
});
