import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => harness.cleanup());

async function firstPropertyId(): Promise<string> {
  const response = await request(harness.app).get('/api/properties?limit=1');
  return response.body.data[0].id as string;
}

describe('system', () => {
  it('reports health', async () => {
    const response = await request(harness.app).get('/api/health').expect(200);

    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.inbox.provider).toBe('simulated');
  });

  it('never exposes credentials through the config endpoint', async () => {
    const response = await request(harness.app).get('/api/config').expect(200);
    const body = JSON.stringify(response.body).toLowerCase();

    expect(body).not.toContain('secret');
    expect(body).not.toContain('refresh_token');
    expect(body).not.toContain('api_key');
  });

  it('404s an unknown route in the standard envelope', async () => {
    const response = await request(harness.app).get('/api/nope').expect(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('does not advertise the server framework', async () => {
    const response = await request(harness.app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sets security headers', async () => {
    const response = await request(harness.app).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('leads', () => {
  it('summarises the pipeline with every stage present', async () => {
    const response = await request(harness.app).get('/api/leads/summary').expect(200);

    expect(response.body.data.stages).toHaveLength(6);
    expect(response.body.data.stages.map((s: { stage: string }) => s.stage)).toEqual([
      'new',
      'qualified',
      'showing',
      'offer',
      'closing',
      'lost',
    ]);
  });

  it('does not treat "summary" as a lead id', async () => {
    // Route ordering regression: `/summary` must be matched before `/:id`.
    const response = await request(harness.app).get('/api/leads/summary');
    expect(response.body.data.stages).toBeDefined();
  });

  it('creates a lead and audits it', async () => {
    const response = await request(harness.app)
      .post('/api/leads')
      .send({ name: 'New Person', email: 'new.person@example.com', side: 'buyer' })
      .expect(201);

    expect(response.body.data.stage).toBe('new');
    expect(response.body.data.temperature).toBe('warm');

    const audit = await request(harness.app).get(
      `/api/audit?subjectId=${response.body.data.id}`,
    );
    expect(audit.body.data[0].action).toBe('lead.created');
  });

  it('rejects a duplicate email with a 409', async () => {
    const payload = {
      name: 'Duplicate',
      email: 'daniel.okafor@example.com',
      side: 'buyer',
    };

    await request(harness.app).post('/api/leads').send(payload).expect(409);
  });

  it('rejects an inverted budget range', async () => {
    await request(harness.app)
      .post('/api/leads')
      .send({
        name: 'Bad Budget',
        email: 'bad.budget@example.com',
        side: 'buyer',
        budgetMin: 900_000,
        budgetMax: 100_000,
      })
      .expect(422);
  });

  it('patches a stage and records the transition', async () => {
    const list = await request(harness.app).get('/api/leads?limit=1');
    const lead = list.body.data[0];

    const response = await request(harness.app)
      .patch(`/api/leads/${lead.id}`)
      .send({ stage: 'closing' })
      .expect(200);

    expect(response.body.data.stage).toBe('closing');

    const audit = await request(harness.app).get(`/api/audit?subjectId=${lead.id}`);
    expect(audit.body.data[0].summary).toMatch(/closing/);
  });

  it('404s a patch against an unknown lead', async () => {
    await request(harness.app)
      .patch('/api/leads/lead_nope')
      .send({ stage: 'closing' })
      .expect(404);
  });
});

describe('properties', () => {
  it('lists seeded listings', async () => {
    const response = await request(harness.app).get('/api/properties').expect(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    const response = await request(harness.app)
      .get('/api/properties?status=closed')
      .expect(200);

    expect(
      response.body.data.every((p: { status: string }) => p.status === 'closed'),
    ).toBe(true);
  });

  it('round-trips the features array through SQLite', async () => {
    const response = await request(harness.app)
      .post('/api/properties')
      .send({
        address: '9 Test Street',
        city: 'Fairhaven',
        price: 500_000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1_800,
        propertyType: 'condo',
        features: ['Balcony', 'Parking'],
      })
      .expect(201);

    const fetched = await request(harness.app).get(
      `/api/properties/${response.body.data.id}`,
    );
    expect(fetched.body.data.features).toEqual(['Balcony', 'Parking']);
  });

  it('rejects a negative price', async () => {
    await request(harness.app)
      .post('/api/properties')
      .send({
        address: '9 Test Street',
        city: 'Fairhaven',
        price: -1,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1_800,
        propertyType: 'condo',
      })
      .expect(422);
  });
});

describe('documents', () => {
  it('generates a real PDF and indexes it', async () => {
    const propertyId = await firstPropertyId();

    const response = await request(harness.app)
      .post('/api/documents/cma')
      .send({
        propertyId,
        comparables: [
          {
            address: 'Nearby',
            price: 800_000,
            bedrooms: 4,
            bathrooms: 3,
            sqft: 2_800,
            soldAt: null,
          },
        ],
      })
      .expect(201);

    expect(response.body.data.kind).toBe('cma');
    expect(response.body.data.sizeBytes).toBeGreaterThan(1_000);
    expect(response.body.data.filename).toMatch(/^cma-[a-z0-9-]+-\d+\.pdf$/);
  });

  it('serves the generated file with a PDF signature', async () => {
    const propertyId = await firstPropertyId();
    const created = await request(harness.app)
      .post('/api/documents/brochure')
      .send({ propertyId });

    const file = await request(harness.app)
      .get(`/documents/${created.body.data.filename}`)
      .expect(200);

    expect(file.headers['content-type']).toMatch(/pdf/);
    expect(file.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('generates a market report without a property', async () => {
    await request(harness.app)
      .post('/api/documents/market-report')
      .send({
        area: 'Fairhaven',
        averageDaysOnMarket: 18,
        averagePrice: 800_000,
        medianPrice: 780_000,
        activeListings: 140,
        monthsOfInventory: 2.3,
      })
      .expect(201);
  });

  it('404s generation against an unknown property', async () => {
    await request(harness.app)
      .post('/api/documents/brochure')
      .send({ propertyId: 'prop_nope' })
      .expect(404);
  });

  it('deletes by id and audits the removal', async () => {
    const propertyId = await firstPropertyId();
    const created = await request(harness.app)
      .post('/api/documents/brochure')
      .send({ propertyId });

    await request(harness.app)
      .delete(`/api/documents/${created.body.data.id}`)
      .expect(204);

    await request(harness.app)
      .get(`/documents/${created.body.data.filename}`)
      .expect(404);

    const audit = await request(harness.app).get(
      `/api/audit?subjectId=${created.body.data.id}`,
    );
    expect(
      audit.body.data.some((e: { action: string }) => e.action === 'document.deleted'),
    ).toBe(true);
  });

  /**
   * Deletion is keyed by document id, so a traversal sequence in the path is
   * simply an id that does not exist. This asserts the shape of the fix, not
   * just its effect.
   */
  it.each(['..%2f..%2fetc%2fpasswd', '..%5c..%5cwindows', 'prop_1%2F..%2F..%2Fetc'])(
    'cannot delete outside the documents directory via %s',
    async (attempt) => {
      const response = await request(harness.app).delete(`/api/documents/${attempt}`);
      expect([404, 400]).toContain(response.status);
    },
  );

  it('does not serve a directory listing', async () => {
    await request(harness.app).get('/documents/').expect(404);
  });
});
