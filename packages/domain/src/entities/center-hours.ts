import type { Brand } from '../value-objects/brand';
import type { TimeWindow } from '../value-objects/time-window';
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
 * A day's `windows` is an ordered, non-overlapping list of {@link TimeWindow}
 * (SOU-197): one window is a plain single-shift day, two model the mid-day lunch
 * break, and an empty list means the day is closed. `dayOfWeek` is immutable — a
 * row is bound to its weekday; editing changes only the times. Not people-like,
 * so no `naturalKey`; uniqueness is `(centerCode, dayOfWeek)` among live rows.
 */
export type CenterHours = EntityEnvelope & {
  readonly id: CenterHoursId;
  readonly dayOfWeek: WeekdayIndex; // 0 = Sunday … 6 = Saturday
  windows: readonly TimeWindow[]; // empty = closed that day
};

/** A day is closed when it has no opening window. */
export function isClosed(hours: Pick<CenterHours, 'windows'>): boolean {
  return hours.windows.length === 0;
}
