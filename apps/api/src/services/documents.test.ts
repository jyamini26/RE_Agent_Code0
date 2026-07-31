import type { Comparable, Property } from '@reap/shared';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWithinDirectory, slugify, summarise } from './documents.js';

const property: Property = {
  id: 'prop_1',
  address: '418 Aldergrove Lane',
  city: 'Fairhaven',
  neighborhood: 'Aldergrove',
  price: 845_000,
  bedrooms: 4,
  bathrooms: 3,
  sqft: 2_940,
  lotSizeSqft: null,
  yearBuilt: 2016,
  propertyType: 'single_family',
  status: 'listed',
  listedAt: '2026-07-17T00:00:00.000Z',
  description: null,
  features: [],
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
};

function comparable(price: number, sqft: number): Comparable {
  return { address: 'Somewhere', price, bedrooms: 4, bathrooms: 3, sqft, soldAt: null };
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('418 Aldergrove Lane')).toBe('418-aldergrove-lane');
  });

  it('strips path separators and traversal sequences', () => {
    expect(slugify('../../etc/passwd')).toBe('etcpasswd');
    expect(slugify('..\\..\\windows')).toBe('windows');
  });

  it('strips characters that would need shell quoting', () => {
    expect(slugify('a"b$c;d|e')).toBe('abcde');
  });

  it('collapses repeated separators and trims them', () => {
    expect(slugify('  --a   b--  ')).toBe('a-b');
  });

  it('never returns an empty string', () => {
    expect(slugify('///')).toBe('document');
    expect(slugify('')).toBe('document');
  });

  it('bounds the length', () => {
    expect(slugify('x'.repeat(500)).length).toBeLessThanOrEqual(60);
  });
});

describe('resolveWithinDirectory', () => {
  const base = '/srv/reap/documents';

  it('resolves a plain filename inside the base', () => {
    expect(resolveWithinDirectory(base, 'cma-1.pdf')).toBe(
      path.join(base, 'cma-1.pdf'),
    );
  });

  it.each([
    '../secrets.env',
    '../../../../etc/passwd',
    'nested/../../escape.txt',
    '/etc/passwd',
  ])('refuses %s', (attempt) => {
    expect(() => resolveWithinDirectory(base, attempt)).toThrow(/outside/);
  });

  it('does not treat a sibling with a shared prefix as inside', () => {
    // `/srv/reap/documents-evil` starts with the base string but is not under
    // it; a naive startsWith check would allow this.
    expect(() => resolveWithinDirectory(base, '../documents-evil/x.pdf')).toThrow();
  });
});

describe('summarise', () => {
  it('falls back to the asking price with no comparables', () => {
    const stats = summarise(property, []);

    expect(stats.indicatedValue).toBe(property.price);
    expect(stats.variancePct).toBe(0);
    expect(stats.narrative).toMatch(/No comparable sales/);
  });

  it('averages and medians an odd-sized set', () => {
    const stats = summarise(property, [
      comparable(800_000, 2_800),
      comparable(850_000, 2_900),
      comparable(900_000, 3_000),
    ]);

    expect(stats.averagePrice).toBe(850_000);
    expect(stats.medianPrice).toBe(850_000);
  });

  it('medians an even-sized set by averaging the middle pair', () => {
    const stats = summarise(property, [
      comparable(800_000, 2_800),
      comparable(900_000, 3_000),
    ]);

    expect(stats.medianPrice).toBe(850_000);
  });

  /**
   * Averaging each comparable's own rate resists a single large home skewing
   * the result, which dividing summed prices by summed area does not.
   */
  it('averages per-comparable rates rather than pooled totals', () => {
    const stats = summarise(property, [
      comparable(300_000, 1_000), // $300/sq ft
      comparable(1_000_000, 10_000), // $100/sq ft
    ]);

    expect(stats.averagePricePerSqft).toBe(200);
  });

  it('flags an asking price above the indicated value', () => {
    const stats = summarise(property, [comparable(500_000, 2_940)]);

    expect(stats.variancePct).toBeGreaterThan(7);
    expect(stats.narrative).toMatch(/above the indicated value/);
  });

  it('flags an asking price below the indicated value', () => {
    const stats = summarise(property, [comparable(1_500_000, 2_940)]);

    expect(stats.variancePct).toBeLessThan(-7);
    expect(stats.narrative).toMatch(/below the indicated value/);
  });

  it('calls a near-match competitively positioned', () => {
    const stats = summarise(property, [comparable(845_000, 2_940)]);

    expect(Math.abs(stats.variancePct)).toBeLessThan(1);
    expect(stats.narrative).toMatch(/consistent with/);
  });

  it('does not divide by zero on a zero-area comparable', () => {
    const stats = summarise(property, [
      { ...comparable(500_000, 1), sqft: 0 } as Comparable,
    ]);

    expect(Number.isFinite(stats.indicatedValue)).toBe(true);
    expect(Number.isNaN(stats.variancePct)).toBe(false);
  });
});
