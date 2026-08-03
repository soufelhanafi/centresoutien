import { describe, it, expect } from 'vitest';
import {
  invoiceDueDate,
  daysOverdue,
  monthsOverdue,
  agingBucketFor,
  AGING_BUCKETS,
  type AgingBucket,
} from '../../../src/policies/invoice-aging';

describe('invoiceDueDate', () => {
  it('is the last calendar day of the billing month', () => {
    expect(invoiceDueDate('2026-02')).toBe('2026-02-28');
    expect(invoiceDueDate('2024-02')).toBe('2024-02-29'); // leap year
    expect(invoiceDueDate('2026-09')).toBe('2026-09-30');
  });
});

describe('daysOverdue', () => {
  it('is 0 for a not-yet-due invoice', () => {
    expect(daysOverdue('2026-09-30', '2026-09-15')).toBe(0);
    expect(daysOverdue('2026-09-30', '2026-09-30')).toBe(0);
  });

  it('counts whole days past the due date', () => {
    expect(daysOverdue('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysOverdue('2026-09-30', '2026-10-30')).toBe(30);
    expect(daysOverdue('2026-09-30', '2026-12-29')).toBe(90);
  });
});

describe('monthsOverdue', () => {
  it('is 0 for the current billing month', () => {
    expect(monthsOverdue('2026-08', '2026-08')).toBe(0);
  });

  it('counts whole calendar months elapsed, including a year rollover', () => {
    expect(monthsOverdue('2026-05', '2026-08')).toBe(3);
    expect(monthsOverdue('2025-11', '2026-02')).toBe(3);
  });

  it('clamps to 0 rather than going negative for a future billing month', () => {
    expect(monthsOverdue('2026-09', '2026-08')).toBe(0);
  });
});

describe('agingBucketFor', () => {
  const cases: { days: number; expected: AgingBucket }[] = [
    { days: 1, expected: '0-30' },
    { days: 29, expected: '0-30' },
    { days: 30, expected: '0-30' },
    { days: 31, expected: '31-60' },
    { days: 59, expected: '31-60' },
    { days: 60, expected: '31-60' },
    { days: 61, expected: '61-90' },
    { days: 89, expected: '61-90' },
    { days: 90, expected: '61-90' },
    { days: 91, expected: '90-plus' },
    { days: 365, expected: '90-plus' },
  ];

  it.each(cases)('$days days overdue → $expected', ({ days, expected }) => {
    expect(agingBucketFor(days)).toBe(expected);
  });

  it('AGING_BUCKETS lists every bucket in ascending order', () => {
    expect(AGING_BUCKETS).toEqual(['0-30', '31-60', '61-90', '90-plus']);
  });
});
