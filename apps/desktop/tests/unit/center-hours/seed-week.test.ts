import { describe, expect, it } from 'vitest';
import { seedWeek, type CenterHoursWeek } from '../../../src/renderer/lib/center-hours';

describe('seedWeek', () => {
  it('returns all seven weekdays in Sunday-first order', () => {
    const week = seedWeek([]);
    expect(week.map((row) => row.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('seeds the domain default (09:00–18:00) for a fresh center with no saved rows', () => {
    const week = seedWeek([]);
    expect(week.every((row) => row.open === '09:00' && row.close === '18:00')).toBe(true);
  });

  it('overrides seeded days with persisted times, including a closed day', () => {
    const persisted: CenterHoursWeek = [
      { dayOfWeek: 1, open: '08:30', close: '20:00' },
      { dayOfWeek: 0, open: null, close: null },
    ];
    const week = seedWeek(persisted);

    expect(week[0]).toEqual({ dayOfWeek: 0, open: null, close: null });
    expect(week[1]).toEqual({ dayOfWeek: 1, open: '08:30', close: '20:00' });
    // Days not in the persisted set still fall back to the default.
    expect(week[2]).toEqual({ dayOfWeek: 2, open: '09:00', close: '18:00' });
  });
});
