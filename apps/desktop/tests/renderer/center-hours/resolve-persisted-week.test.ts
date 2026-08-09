import { describe, expect, it } from 'vitest';
import { resolvePersistedWeek, type CenterHoursWeek } from '../../../src/renderer/lib/center-hours';

describe('resolvePersistedWeek', () => {
  it('returns the 7-row default week for undefined', () => {
    const week = resolvePersistedWeek(undefined);
    expect(week.map((row) => row.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.every((row) => row.open === '09:00' && row.close === '18:00')).toBe(true);
  });

  it('returns the 7-row default week for an empty array', () => {
    const week = resolvePersistedWeek([]);
    expect(week.map((row) => row.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.every((row) => row.open === '09:00' && row.close === '18:00')).toBe(true);
  });

  it('returns a persisted non-empty week unchanged', () => {
    const persisted: CenterHoursWeek = [
      { dayOfWeek: 0, open: null, close: null },
      { dayOfWeek: 1, open: '08:30', close: '20:00' },
      { dayOfWeek: 2, open: '19:00', close: '22:00' },
    ];
    expect(resolvePersistedWeek(persisted)).toEqual(persisted);
  });
});
