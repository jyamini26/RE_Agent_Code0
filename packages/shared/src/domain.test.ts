import { describe, expect, it } from 'vitest';
import {
  createLeadSchema,
  daysOnMarket,
  generateMarketReportSchema,
  leadSchema,
  paginationQuerySchema,
} from './index.js';

const baseLead = {
  name: 'Daniel Okafor',
  email: 'daniel@example.com',
  side: 'buyer' as const,
};

describe('createLeadSchema', () => {
  it('accepts the minimum viable lead', () => {
    const result = createLeadSchema.safeParse(baseLead);
    expect(result.success).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = createLeadSchema.safeParse({ ...baseLead, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects an inverted budget range', () => {
    const result = createLeadSchema.safeParse({
      ...baseLead,
      budgetMin: 900_000,
      budgetMax: 500_000,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/budgetMin/);
  });

  it('allows a one-sided budget', () => {
    expect(
      createLeadSchema.safeParse({ ...baseLead, budgetMax: 500_000 }).success,
    ).toBe(true);
    expect(
      createLeadSchema.safeParse({ ...baseLead, budgetMin: 500_000 }).success,
    ).toBe(true);
  });

  it('rejects an unknown stage', () => {
    expect(
      createLeadSchema.safeParse({ ...baseLead, stage: 'negotiating' }).success,
    ).toBe(false);
  });
});

describe('leadSchema', () => {
  it('requires nullable fields to be present, not absent', () => {
    // The stored shape is total: a persisted lead always has every key, with
    // null standing in for "unknown". Only the create input is partial.
    const result = leadSchema.safeParse({
      id: 'lead_1',
      ...baseLead,
      stage: 'new',
      temperature: 'warm',
      createdAt: '2026-07-29T12:00:00.000Z',
      updatedAt: '2026-07-29T12:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('coerces numeric strings from the query string', () => {
    const result = paginationQuerySchema.parse({ limit: '25', offset: '50' });
    expect(result).toEqual({ limit: 25, offset: 50 });
  });

  it('applies defaults when absent', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it('caps limit so a client cannot request the whole table', () => {
    expect(paginationQuerySchema.safeParse({ limit: '5000' }).success).toBe(false);
  });

  it('rejects a negative offset', () => {
    expect(paginationQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('generateMarketReportSchema', () => {
  it('defaults an unspecified trend to balanced', () => {
    const result = generateMarketReportSchema.parse({
      area: 'Fairhaven',
      averageDaysOnMarket: 18,
      averagePrice: 800_000,
      medianPrice: 780_000,
      activeListings: 140,
      monthsOfInventory: 2.3,
    });

    expect(result.trend).toBe('balanced');
  });
});

describe('daysOnMarket', () => {
  const property = {
    listedAt: '2026-07-01T00:00:00.000Z',
  } as Parameters<typeof daysOnMarket>[0];

  it('counts whole elapsed days', () => {
    expect(daysOnMarket(property, new Date('2026-07-13T06:00:00.000Z'))).toBe(12);
  });

  it('never returns a negative count for a future listing date', () => {
    expect(daysOnMarket(property, new Date('2026-06-01T00:00:00.000Z'))).toBe(0);
  });
});
