import { describe, it, expect } from 'vitest';
import { monthsEndingAt, monthDateRange } from '../../../src/value-objects/month';

describe('monthsEndingAt', () => {
  it('returns a single-element window equal to endMonth when count is 1', () => {
    expect(monthsEndingAt('2026-08', 1)).toEqual(['2026-08']);
  });

  it('returns the trailing months, oldest first, ending at endMonth', () => {
    expect(monthsEndingAt('2026-08', 6)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('rolls over the year boundary', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('returns an empty array for count 0', () => {
    expect(monthsEndingAt('2026-08', 0)).toEqual([]);
  });
});

describe('monthDateRange', () => {
  it.each([
    { month: '2026-08', start: '2026-08-01', end: '2026-08-31' },
    { month: '2026-04', start: '2026-04-01', end: '2026-04-30' },
    { month: '2026-02', start: '2026-02-01', end: '2026-02-28' }, // 2026 is not a leap year
    { month: '2024-02', start: '2024-02-01', end: '2024-02-29' }, // 2024 is a leap year
  ])('resolves $month to [$start, $end]', ({ month, start, end }) => {
    expect(monthDateRange(month)).toEqual({ start, end });
  });
});
