import { describe, it, expect } from 'vitest';
import { holidayCoversDate, holidayOn, type HolidayOccurrence } from '../../../src/policies/holiday-policy';
import type { HolidayId } from '../../../src/entities/holiday';

function occ(over: Partial<HolidayOccurrence>): HolidayOccurrence {
  return {
    id: 'hol_00000000000000000000000001' as HolidayId,
    name: { fr: 'H', ar: 'ع' },
    kind: 'fixed',
    startDate: '2026-07-30',
    endDate: '2026-07-30',
    ...over,
  };
}

describe('holidayCoversDate', () => {
  describe('lunar (pinned to the entered year)', () => {
    const eid = occ({ kind: 'lunar', startDate: '2026-05-27', endDate: '2026-05-29' });

    it('covers dates inside the inclusive range', () => {
      expect(holidayCoversDate(eid, '2026-05-27')).toBe(true);
      expect(holidayCoversDate(eid, '2026-05-28')).toBe(true);
      expect(holidayCoversDate(eid, '2026-05-29')).toBe(true);
    });

    it('does not cover the day before/after or the same month-day in another year', () => {
      expect(holidayCoversDate(eid, '2026-05-26')).toBe(false);
      expect(holidayCoversDate(eid, '2026-05-30')).toBe(false);
      expect(holidayCoversDate(eid, '2027-05-28')).toBe(false); // lunar does NOT recur
    });
  });

  describe('fixed (recurs every year on the same month-day)', () => {
    const throne = occ({ kind: 'fixed', startDate: '2026-07-30', endDate: '2026-07-30' });

    it('covers the same month-day in any year', () => {
      expect(holidayCoversDate(throne, '2026-07-30')).toBe(true);
      expect(holidayCoversDate(throne, '2027-07-30')).toBe(true);
      expect(holidayCoversDate(throne, '2099-07-30')).toBe(true);
    });

    it('does not cover a different month-day', () => {
      expect(holidayCoversDate(throne, '2026-07-29')).toBe(false);
      expect(holidayCoversDate(throne, '2026-07-31')).toBe(false);
    });

    it('covers a same-year multi-day window across years', () => {
      const summer = occ({ kind: 'fixed', startDate: '2026-07-01', endDate: '2026-08-31' });
      expect(holidayCoversDate(summer, '2030-07-15')).toBe(true);
      expect(holidayCoversDate(summer, '2030-08-31')).toBe(true);
      expect(holidayCoversDate(summer, '2030-06-30')).toBe(false);
      expect(holidayCoversDate(summer, '2030-09-01')).toBe(false);
    });

    it('handles a window that wraps the year boundary (Dec 24 → Jan 04)', () => {
      const winter = occ({ kind: 'fixed', startDate: '2026-12-24', endDate: '2027-01-04' });
      expect(holidayCoversDate(winter, '2030-12-24')).toBe(true);
      expect(holidayCoversDate(winter, '2030-12-31')).toBe(true);
      expect(holidayCoversDate(winter, '2031-01-01')).toBe(true);
      expect(holidayCoversDate(winter, '2031-01-04')).toBe(true);
      expect(holidayCoversDate(winter, '2030-12-23')).toBe(false);
      expect(holidayCoversDate(winter, '2031-01-05')).toBe(false);
    });
  });
});

describe('holidayOn', () => {
  const list: readonly HolidayOccurrence[] = [
    occ({ id: 'hol_00000000000000000000000001' as HolidayId, kind: 'fixed', startDate: '2026-07-30', endDate: '2026-07-30' }),
    occ({ id: 'hol_00000000000000000000000002' as HolidayId, kind: 'lunar', startDate: '2026-05-27', endDate: '2026-05-29' }),
  ];

  it('returns the first matching holiday', () => {
    expect(holidayOn('2027-07-30', list)?.id).toBe('hol_00000000000000000000000001');
    expect(holidayOn('2026-05-28', list)?.id).toBe('hol_00000000000000000000000002');
  });

  it('returns null when no holiday covers the date', () => {
    expect(holidayOn('2026-06-15', list)).toBeNull();
  });
});
