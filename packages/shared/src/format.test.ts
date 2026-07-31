import { describe, expect, it } from 'vitest';
import {
  formatPrice,
  formatPriceCompact,
  formatPricePerSqft,
  formatRelativeTime,
  formatSqft,
  titleCase,
} from './format.js';

describe('formatPrice', () => {
  it('renders whole dollars with no cents', () => {
    expect(formatPrice(845_000)).toBe('$845,000');
  });

  it('handles zero', () => {
    expect(formatPrice(0)).toBe('$0');
  });
});

describe('formatPriceCompact', () => {
  it('abbreviates millions', () => {
    expect(formatPriceCompact(4_200_000)).toBe('$4.2M');
  });

  it('abbreviates thousands', () => {
    expect(formatPriceCompact(845_000)).toBe('$845K');
  });
});

describe('formatPricePerSqft', () => {
  it('divides and rounds', () => {
    expect(formatPricePerSqft(500_000, 2_000)).toBe('$250/sq ft');
  });

  it('does not divide by zero', () => {
    expect(formatPricePerSqft(500_000, 0)).toBe('n/a');
  });
});

describe('formatSqft', () => {
  it('adds thousands separators and a unit', () => {
    expect(formatSqft(2_940)).toBe('2,940 sq ft');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-29T12:00:00.000Z');

  it('reports null as never', () => {
    expect(formatRelativeTime(null, now)).toBe('never');
  });

  it('collapses the last minute to "just now"', () => {
    expect(formatRelativeTime('2026-07-29T11:59:30.000Z', now)).toBe('just now');
  });

  it('singularises a one-unit gap', () => {
    expect(formatRelativeTime('2026-07-29T11:00:00.000Z', now)).toBe('1 hour ago');
    expect(formatRelativeTime('2026-07-28T12:00:00.000Z', now)).toBe('1 day ago');
  });

  it('pluralises beyond one unit', () => {
    expect(formatRelativeTime('2026-07-29T09:00:00.000Z', now)).toBe('3 hours ago');
  });

  it('falls back to a date past four weeks', () => {
    expect(formatRelativeTime('2026-01-04T12:00:00.000Z', now)).toMatch(/2026/);
  });

  it('does not report a future timestamp as elapsed', () => {
    expect(formatRelativeTime('2026-07-30T12:00:00.000Z', now)).toBe('scheduled');
  });

  it('degrades gracefully on an unparseable value', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('unknown');
  });
});

describe('titleCase', () => {
  it('expands snake_case', () => {
    expect(titleCase('single_family')).toBe('Single Family');
  });

  it('leaves a single word capitalised', () => {
    expect(titleCase('listed')).toBe('Listed');
  });

  it('tolerates an empty string', () => {
    expect(titleCase('')).toBe('');
  });
});
