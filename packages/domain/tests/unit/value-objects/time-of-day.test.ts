import { describe, it, expect } from 'vitest';
import { isTimeOfDay, toMinutes } from '../../../src/value-objects/time-of-day';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';

describe('isTimeOfDay', () => {
  it.each(['00:00', '09:00', '18:30', '23:59'])('accepts valid 24h time %s', (value) => {
    expect(isTimeOfDay(value)).toBe(true);
  });

  it.each(['24:00', '9:00', '09:0', '18:60', '18-30', '', 'noon', '18:30 '])(
    'rejects invalid time %s',
    (value) => {
      expect(isTimeOfDay(value)).toBe(false);
    },
  );
});

describe('toMinutes', () => {
  it.each([
    ['00:00', 0],
    ['09:00', 540],
    ['18:30', 1110],
    ['23:59', 1439],
  ] as const)('%s → %i minutes since midnight', (value, expected) => {
    expect(toMinutes(value as TimeOfDay)).toBe(expected);
  });
});
