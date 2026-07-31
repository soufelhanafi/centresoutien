import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for holidays: `hol_01HW…`. */
export const HOLIDAY_ID_PREFIX = 'hol';

export type HolidayId = Brand<string, 'HolidayId'>;

/**
 * How a holiday repeats (CLAUDE.md §6):
 * - `fixed` — a solar/Gregorian holiday that recurs **every year on the same
 *   month-day** (New Year, Throne Day…). One row covers all years.
 * - `lunar` — a Hijri-based holiday (Eid, Mawlid…) entered **manually for one
 *   specific year**. We deliberately do not compute a Hijri calendar: Moroccan
 *   lunar dates are announced by the government and can shift a day at the last
 *   minute, so the admin adds each year's occurrence by hand.
 */
export type HolidayKind = 'fixed' | 'lunar';

/**
 * A day (or contiguous range of days) the center is closed, configured under the
 * every-plan `settings.holidays` feature (moved to Essentiel in SOU-30). Scheduling
 * rejects sessions that fall on a holiday (`SessionConflictPolicy.notOnHoliday`);
 * the future session generator (SOU-56) skips them when materializing recurring
 * sessions.
 *
 * `startDate`/`endDate` are inclusive calendar dates in strict `YYYY-MM-DD` form —
 * a single-day holiday has `startDate === endDate`; a multi-day *vacances* spans a
 * range. Dates are plain civil dates, never `Date` instants, so they carry no time
 * zone and compare lexicographically (= chronologically).
 *
 * `affectsInvoicing` is **always `false`** — an invariant, not editable data.
 * Billing in Centre Soutien is monthly (subscriptions and payouts), never per
 * session, so a month with a holiday charges the same as any other. The field is
 * a readonly `false` literal so a Holiday that affects invoicing cannot even be
 * constructed; it is derived, not persisted (no DB column).
 *
 * Not people-like — identified by its dates and name, not a matching key — so it
 * carries no `naturalKey`. Soft-delete only (archive/restore via the envelope
 * tombstone).
 */
export type Holiday = EntityEnvelope & {
  readonly id: HolidayId;
  name: { fr: string; ar: string };
  kind: HolidayKind;
  startDate: string; // inclusive 'YYYY-MM-DD'
  endDate: string; // inclusive 'YYYY-MM-DD', always >= startDate
  readonly affectsInvoicing: false; // invariant: holidays never change billing
};
