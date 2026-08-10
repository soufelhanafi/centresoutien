import { describe, it, expect } from 'vitest';
import {
  weekdayOf,
  eachDateInRange,
  daysBetween,
  addDays,
  weekdayInWeekOf,
  endDateAfterWeekdayOccurrences,
} from '../../../src/value-objects/date-range';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

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

describe('weekdayInWeekOf', () => {
  // The week runs Sunday 2026-08-09 .. Saturday 2026-08-15; 2026-08-10 is Monday.
  it.each([
    ['2026-08-10', 0, '2026-08-09'], // Sunday of that week
    ['2026-08-10', 1, '2026-08-10'], // Monday itself
    ['2026-08-10', 3, '2026-08-12'], // Wednesday
    ['2026-08-10', 6, '2026-08-15'], // Saturday
  ])('from %s, weekday %i is %s', (reference, weekday, expected) => {
    expect(weekdayInWeekOf(reference, weekday as WeekdayIndex)).toBe(expected);
  });

  it('resolves the same week from any day within it (Wednesday reference → same Monday)', () => {
    expect(weekdayInWeekOf('2026-08-12', 1 as WeekdayIndex)).toBe('2026-08-10');
    expect(weekdayInWeekOf('2026-08-15', 1 as WeekdayIndex)).toBe('2026-08-10');
  });

  it('crosses a month boundary correctly', () => {
    // 2026-09-02 is a Wednesday; the Sunday of its week is 2026-08-30.
    expect(weekdayInWeekOf('2026-09-02', 0 as WeekdayIndex)).toBe('2026-08-30');
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

describe('daysBetween', () => {
  it('is 0 for the same date', () => {
    expect(daysBetween('2026-09-30', '2026-09-30')).toBe(0);
  });

  it('is positive when `to` is later, negative when earlier', () => {
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-01', '2026-09-30')).toBe(-1);
  });

  it('rolls over a leap February correctly', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // 2024-02-29 exists
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // 2026-02-29 does not
  });

  it('rolls over a year boundary', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('addDays', () => {
  it('returns the same date for a zero shift', () => {
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
  });

  it('steps forward across a non-leap February (2026 has 28 days)', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });

  it('steps forward across a leap February (2028 has 29 days)', () => {
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
  });

  it('steps forward across a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('steps backward across a year boundary', () => {
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('steps backward across a month boundary', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('endDateAfterWeekdayOccurrences', () => {
  // 2026-01-01 is a Thursday (weekday 4); January's Thursdays are 01, 08, 15, 22, 29.
  const THURSDAY = 4 as WeekdayIndex;
  const MONDAY = 1 as WeekdayIndex;

  it('returns the start date itself when it already falls on the target weekday and count is 1', () => {
    expect(endDateAfterWeekdayOccurrences('2026-01-01', THURSDAY, 1)).toBe('2026-01-01');
  });

  it('walks 7 days per occurrence once on the target weekday', () => {
    expect(endDateAfterWeekdayOccurrences('2026-01-01', THURSDAY, 5)).toBe('2026-01-29');
  });

  it('finds the first occurrence forward when the start date is not on the target weekday', () => {
    expect(endDateAfterWeekdayOccurrences('2026-01-01', MONDAY, 1)).toBe('2026-01-05');
  });

  it('combines the forward search with the weekly step for counts beyond 1', () => {
    expect(endDateAfterWeekdayOccurrences('2026-01-01', MONDAY, 3)).toBe('2026-01-19');
  });

  it('throws for a non-positive occurrence count', () => {
    expect(() => endDateAfterWeekdayOccurrences('2026-01-01', THURSDAY, 0)).toThrow(RangeError);
    expect(() => endDateAfterWeekdayOccurrences('2026-01-01', THURSDAY, -1)).toThrow(RangeError);
  });

  it('throws for a non-integer occurrence count', () => {
    expect(() => endDateAfterWeekdayOccurrences('2026-01-01', THURSDAY, 1.5)).toThrow(RangeError);
  });
});
