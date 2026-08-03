import { describe, it, expect } from 'vitest';
import { shiftWeek, weekRangeContaining } from '../../../src/renderer/lib/planning/week-range';

describe('weekRangeContaining', () => {
  it('returns Monday-to-Sunday for a mid-week Wednesday', () => {
    expect(weekRangeContaining('2026-08-05')).toEqual({ start: '2026-08-03', end: '2026-08-09' });
  });

  it('returns the same week when the anchor is already Monday', () => {
    expect(weekRangeContaining('2026-08-03')).toEqual({ start: '2026-08-03', end: '2026-08-09' });
  });

  it('treats Sunday as the last day of its week, not the first of the next', () => {
    expect(weekRangeContaining('2026-08-09')).toEqual({ start: '2026-08-03', end: '2026-08-09' });
  });

  it('carries a week range correctly across a month boundary', () => {
    expect(weekRangeContaining('2026-08-31')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });
});

describe('shiftWeek', () => {
  it('moves the anchor forward by one week', () => {
    expect(shiftWeek('2026-08-05', 1)).toBe('2026-08-12');
  });

  it('moves the anchor backward by one week', () => {
    expect(shiftWeek('2026-08-05', -1)).toBe('2026-07-29');
  });

  it('is a no-op for a zero delta', () => {
    expect(shiftWeek('2026-08-05', 0)).toBe('2026-08-05');
  });
});
