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
 *
 * Sync merge granularity (SOU-219, decided): `windows` is one sync field, so two
 * laptops editing the same weekday's hours clash in the conflict popup instead of
 * auto-merging — coarser than the pre-SOU-197 `open`/`close` pair, and kept that
 * way on purpose. The ordered/non-overlapping invariant spans the whole list, so
 * a per-window half-merge (my `windows[0]` + their `windows[1]`) could yield an
 * overlapping or unsorted — invalid — day; a whole-list clash is the correct
 * conservative behavior. Per-window merge inside the JSON value is deliberately
 * not added: center hours are rarely-touched admin config, so a same-weekday
 * concurrent edit is near-zero probability and a one-click mine/theirs is fine.
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
