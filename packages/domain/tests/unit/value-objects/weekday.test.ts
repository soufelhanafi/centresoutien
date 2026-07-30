import { describe, it, expect } from 'vitest';
import { WEEKDAYS, isWeekdayIndex } from '../../../src/value-objects/weekday';

describe('WEEKDAYS', () => {
  it('lists the seven weekdays Sunday-first', () => {
    expect(WEEKDAYS).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('isWeekdayIndex', () => {
  it.each([0, 1, 6])('accepts in-range integer %i', (value) => {
    expect(isWeekdayIndex(value)).toBe(true);
  });

  it.each([-1, 7, 3.5, Number.NaN])('rejects out-of-range or non-integer %s', (value) => {
    expect(isWeekdayIndex(value)).toBe(false);
  });
});
