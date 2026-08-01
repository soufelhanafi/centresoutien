import { describe, it, expect } from 'vitest';
import { weekdayOf, eachDateInRange } from '../../../src/value-objects/date-range';

describe('weekdayOf', () => {
  // 2026-01-01 is a Thursday (index 4); the rest of the week follows.
  it.each([
    ['2026-01-04', 0], // Sunday
    ['2026-01-05', 1], // Monday
    ['2026-01-06', 2], // Tuesday
    ['2026-01-07', 3], // Wednesday
    ['2026-01-01', 4], // Thursday
    ['2026-01-02', 5], // Friday
    ['2026-01-03', 6], // Saturday
  ])('maps %s to weekday %i (0=Sun … 6=Sat)', (date, expected) => {
    expect(weekdayOf(date)).toBe(expected);
  });

  it('is timezone-free — the same civil date always yields the same weekday', () => {
    expect(weekdayOf('2027-01-01')).toBe(5); // Friday (2026 is not a leap year)
  });
});

describe('eachDateInRange', () => {
  it('includes both endpoints for a single-day range', () => {
    expect(eachDateInRange({ start: '2026-01-01', end: '2026-01-01' })).toEqual(['2026-01-01']);
  });

  it('walks an inclusive range in chronological order', () => {
    expect(eachDateInRange({ start: '2026-01-01', end: '2026-01-03' })).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('is empty when the range runs backwards', () => {
    expect(eachDateInRange({ start: '2026-01-05', end: '2026-01-01' })).toEqual([]);
  });

  it('rolls over a non-leap February correctly (2026 has 28 days)', () => {
    expect(eachDateInRange({ start: '2026-02-27', end: '2026-03-01' })).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('rolls over a leap February correctly (2028 has 29 days)', () => {
    expect(eachDateInRange({ start: '2028-02-28', end: '2028-03-01' })).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('rolls over the year boundary', () => {
    expect(eachDateInRange({ start: '2026-12-30', end: '2027-01-02' })).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});
