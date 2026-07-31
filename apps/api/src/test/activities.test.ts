import type { Activity } from '@reap/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await harness.ingest();
});

afterEach(() => harness.cleanup());

async function pending(): Promise<Activity[]> {
  const response = await request(harness.app)
    .get('/api/activities?status=pending')
    .expect(200);
  return response.body.data as Activity[];
}

async function firstWithDraft(): Promise<Activity> {
  const activity = (await pending()).find((a) => a.draft !== null);
  if (!activity) throw new Error('fixture set produced no drafted activity');
  return activity;
}

describe('GET /api/activities', () => {
  it('returns the ingested queue with pagination metadata', async () => {
    const response = await request(harness.app).get('/api/activities').expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.meta).toMatchObject({ limit: 50, offset: 0 });
    expect(response.body.meta.total).toBe(response.body.data.length);
  });

  it('filters by status', async () => {
    const response = await request(harness.app)
      .get('/api/activities?status=approved')
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('rejects an unknown status with a 422 and field detail', async () => {
    const response = await request(harness.app)
      .get('/api/activities?status=banana')
      .expect(422);

    expect(response.body.error.code).toBe('validation_failed');
    expect(response.body.error.issues[0].path).toBe('status');
  });

  it('honours limit and offset', async () => {
    const all = await request(harness.app).get('/api/activities?limit=100');
    const page = await request(harness.app).get('/api/activities?limit=2&offset=1');

    expect(page.body.data).toHaveLength(2);
    expect(page.body.data[0].id).toBe(all.body.data[1].id);
  });

  it('404s an unknown id', async () => {
    await request(harness.app).get('/api/activities/act_nope').expect(404);
  });
});

describe('ingestion', () => {
  it('classifies every fixture and files it pending', async () => {
    const queue = await pending();

    // Seven fixtures, spanning every intent branch including the one that
    // deliberately produces no draft.
    expect(queue).toHaveLength(7);
    expect(queue.some((a) => a.draft === null)).toBe(true);
    expect(queue.every((a) => a.status === 'pending')).toBe(true);
  });

  it('is idempotent across repeated polls', async () => {
    const before = (await pending()).length;

    await harness.container.services.ingestion.pollOnce();
    await harness.container.services.ingestion.pollOnce();

    expect((await pending()).length).toBe(before);
  });

  it('associates a message with the listing it names', async () => {
    const queue = await pending();
    const aboutListing = queue.find((a) =>
      a.message.subject.includes('418 Aldergrove Lane'),
    );

    expect(aboutListing?.propertyId).not.toBeNull();
  });

  it('links a known sender to their existing lead', async () => {
    const queue = await pending();
    const fromKnownLead = queue.find(
      (a) => a.message.fromEmail === 'daniel.okafor@example.com',
    );

    expect(fromKnownLead?.leadId).not.toBeNull();
  });

  it('writes a system audit entry per ingested message', async () => {
    const response = await request(harness.app).get('/api/audit?limit=100');
    const created = response.body.data.filter(
      (e: { action: string }) => e.action === 'activity.created',
    );

    expect(created).toHaveLength(7);
    expect(created.every((e: { actor: string }) => e.actor === 'system')).toBe(true);
  });
});

describe('POST /api/activities/:id/approve', () => {
  it('sends the draft and marks the activity approved', async () => {
    const activity = await firstWithDraft();

    const response = await request(harness.app)
      .post(`/api/activities/${activity.id}/approve`)
      .expect(200);

    expect(response.body.data.status).toBe('approved');
    expect(response.body.data.resolvedAt).not.toBeNull();
    expect(harness.mailer.sent).toHaveLength(1);
    expect(harness.mailer.sent[0]?.to).toBe(activity.draft?.to);
  });

  it('refuses to approve twice', async () => {
    const activity = await firstWithDraft();

    await request(harness.app)
      .post(`/api/activities/${activity.id}/approve`)
      .expect(200);

    const conflict = await request(harness.app)
      .post(`/api/activities/${activity.id}/approve`)
      .expect(409);

    expect(conflict.body.error.code).toBe('conflict');
    // Critically, the second attempt must not have sent a second email.
    expect(harness.mailer.sent).toHaveLength(1);
  });

  it('refuses to approve an activity with no draft', async () => {
    const draftless = (await pending()).find((a) => a.draft === null);

    const response = await request(harness.app)
      .post(`/api/activities/${draftless?.id}/approve`)
      .expect(422);

    expect(response.body.error.code).toBe('no_draft');
    expect(harness.mailer.sent).toHaveLength(0);
  });

  it('marks the activity failed and sends nothing when delivery throws', async () => {
    const activity = await firstWithDraft();
    harness.mailer.shouldFail = true;

    await request(harness.app)
      .post(`/api/activities/${activity.id}/approve`)
      .expect(500);

    const after = await request(harness.app).get(`/api/activities/${activity.id}`);

    expect(after.body.data.status).toBe('failed');
    expect(after.body.data.error).toMatch(/SMTP/);
    expect(harness.mailer.sent).toHaveLength(0);
  });

  it('advances the lead stage forward only', async () => {
    const queue = await pending();
    const showing = queue.find(
      (a) => a.classification.intent === 'showing_request' && a.leadId,
    );
    if (!showing?.leadId) throw new Error('expected a showing request with a lead');

    const before = await request(harness.app).get(`/api/leads/${showing.leadId}`);
    await request(harness.app)
      .post(`/api/activities/${showing.id}/approve`)
      .expect(200);
    const after = await request(harness.app).get(`/api/leads/${showing.leadId}`);

    const order = ['new', 'qualified', 'showing', 'offer', 'closing'];
    expect(order.indexOf(after.body.data.stage)).toBeGreaterThanOrEqual(
      order.indexOf(before.body.data.stage),
    );
    expect(after.body.data.lastContactAt).not.toBeNull();
  });

  it('records the approval in the audit trail', async () => {
    const activity = await firstWithDraft();
    await request(harness.app).post(`/api/activities/${activity.id}/approve`);

    const audit = await request(harness.app).get(`/api/audit?subjectId=${activity.id}`);
    const actions = audit.body.data.map((e: { action: string }) => e.action);

    expect(actions).toContain('activity.approved');
    expect(actions).toContain('activity.created');
  });
});

describe('POST /api/activities/:id/modify', () => {
  it('replaces the drafted subject and body', async () => {
    const activity = await firstWithDraft();

    const response = await request(harness.app)
      .post(`/api/activities/${activity.id}/modify`)
      .send({ draft: { subject: 'Rewritten subject' } })
      .expect(200);

    expect(response.body.data.draft.subject).toBe('Rewritten subject');
    // An unspecified field must survive the patch.
    expect(response.body.data.draft.body).toBe(activity.draft?.body);
    expect(response.body.data.status).toBe('pending');
  });

  it('records both sides of the edit for review', async () => {
    const activity = await firstWithDraft();

    await request(harness.app)
      .post(`/api/activities/${activity.id}/modify`)
      .send({ draft: { body: 'Entirely my own words.' } });

    const audit = await request(harness.app).get(`/api/audit?subjectId=${activity.id}`);
    const modified = audit.body.data.find(
      (e: { action: string }) => e.action === 'activity.modified',
    );

    expect(modified.detail.before.body).toBe(activity.draft?.body);
    expect(modified.detail.after.body).toBe('Entirely my own words.');
  });

  it('sends the edited text, not the original', async () => {
    const activity = await firstWithDraft();

    await request(harness.app)
      .post(`/api/activities/${activity.id}/modify`)
      .send({ draft: { body: 'Edited before sending.' } });

    await request(harness.app).post(`/api/activities/${activity.id}/approve`);

    expect(harness.mailer.sent[0]?.body).toBe('Edited before sending.');
  });

  it('rejects an invalid recipient', async () => {
    const activity = await firstWithDraft();

    await request(harness.app)
      .post(`/api/activities/${activity.id}/modify`)
      .send({ draft: { to: 'not-an-email' } })
      .expect(422);
  });

  it('refuses to modify a resolved activity', async () => {
    const activity = await firstWithDraft();
    await request(harness.app).post(`/api/activities/${activity.id}/approve`);

    await request(harness.app)
      .post(`/api/activities/${activity.id}/modify`)
      .send({ draft: { subject: 'Too late' } })
      .expect(409);
  });
});

describe('POST /api/activities/:id/dismiss', () => {
  it('resolves without sending anything', async () => {
    const activity = await firstWithDraft();

    const response = await request(harness.app)
      .post(`/api/activities/${activity.id}/dismiss`)
      .send({ reason: 'Handled by phone' })
      .expect(200);

    expect(response.body.data.status).toBe('dismissed');
    expect(harness.mailer.sent).toHaveLength(0);
  });

  it('keeps the stated reason in the record', async () => {
    const activity = await firstWithDraft();

    await request(harness.app)
      .post(`/api/activities/${activity.id}/dismiss`)
      .send({ reason: 'Spam' });

    const audit = await request(harness.app).get(`/api/audit?subjectId=${activity.id}`);
    const dismissed = audit.body.data.find(
      (e: { action: string }) => e.action === 'activity.dismissed',
    );

    expect(dismissed.detail.reason).toBe('Spam');
  });

  it('can dismiss an activity that has no draft', async () => {
    const draftless = (await pending()).find((a) => a.draft === null);

    await request(harness.app)
      .post(`/api/activities/${draftless?.id}/dismiss`)
      .send({})
      .expect(200);
  });
});
