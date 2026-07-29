import type { Brand } from '../value-objects/brand';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for center-hours rows: `chr_01HW…`. */
export const CENTER_HOURS_ID_PREFIX = 'chr';

export type CenterHoursId = Brand<string, 'CenterHoursId'>;

/**
 * One weekday's opening hours for a center (CLAUDE.md §6). The week is stored as
 * seven independent rows — one per `dayOfWeek` — so a Monday edit on one laptop
 * and a Tuesday edit on another merge field-cleanly with no week-aggregate
 * conflict. Configured under the every-plan `settings.center-hours` feature.
 *
 * A closed day is represented by `open === null` **and** `close === null` (the
 * migration's CHECK forbids the half-set state). `dayOfWeek` is immutable — a row
 * is bound to its weekday; editing changes only the times. Not people-like, so
 * no `naturalKey`; uniqueness is `(centerCode, dayOfWeek)` among live rows.
 */
export type CenterHours = EntityEnvelope & {
  readonly id: CenterHoursId;
  readonly dayOfWeek: WeekdayIndex; // 0 = Sunday … 6 = Saturday
  open: TimeOfDay | null; // null (with close null) = closed that day
  close: TimeOfDay | null;
};

/** A day is closed when it has no opening time (equivalently, no closing time). */
export function isClosed(hours: Pick<CenterHours, 'open' | 'close'>): boolean {
  return hours.open === null || hours.close === null;
}
