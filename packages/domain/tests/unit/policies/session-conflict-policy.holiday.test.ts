import { describe, it, expect } from 'vitest';
import { SessionConflictPolicy } from '../../../src/policies/session-conflict-policy';
import { SessionOnHolidayError } from '../../../src/errors/scheduling-errors';
import type { HolidayOccurrence } from '../../../src/policies/holiday-policy';
import type { HolidayId } from '../../../src/entities/holiday';

const throne: HolidayOccurrence = {
  id: 'hol_00000000000000000000000001' as HolidayId,
  name: { fr: 'Fête du Trône', ar: 'عيد العرش' },
  kind: 'fixed',
  startDate: '2026-07-30',
  endDate: '2026-07-30',
};
const eid: HolidayOccurrence = {
  id: 'hol_00000000000000000000000002' as HolidayId,
  name: { fr: 'Aïd al-Fitr', ar: 'عيد الفطر' },
  kind: 'lunar',
  startDate: '2026-05-27',
  endDate: '2026-05-29',
};

describe('SessionConflictPolicy.notOnHoliday', () => {
  it('returns null when the date is clear', () => {
    expect(SessionConflictPolicy.notOnHoliday('2026-06-15', [throne, eid])).toBeNull();
  });

  it('returns null when there are no holidays configured', () => {
    expect(SessionConflictPolicy.notOnHoliday('2026-07-30', [])).toBeNull();
  });

  it('rejects a session on a fixed holiday (any year) with the matched holiday carried', () => {
    const error = SessionConflictPolicy.notOnHoliday('2028-07-30', [throne, eid]);
    expect(error).toBeInstanceOf(SessionOnHolidayError);
    expect(error?.date).toBe('2028-07-30');
    expect(error?.holidayId).toBe(throne.id);
    expect(error?.holidayName).toEqual({ fr: 'Fête du Trône', ar: 'عيد العرش' });
  });

  it('rejects a session inside a lunar holiday range in its entered year only', () => {
    expect(SessionConflictPolicy.notOnHoliday('2026-05-28', [eid])).toBeInstanceOf(SessionOnHolidayError);
    // lunar does not recur — the same month-day next year is clear.
    expect(SessionConflictPolicy.notOnHoliday('2027-05-28', [eid])).toBeNull();
  });
});
