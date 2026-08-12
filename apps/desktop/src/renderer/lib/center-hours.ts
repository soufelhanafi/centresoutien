import { DEFAULT_WEEKLY_HOURS, WEEKDAYS, type WeekdayHoursInput } from '@centresoutien/domain';
import type { IpcResponse } from '../../shared/ipc/contract';

/** The persisted week as returned by `centerHours.get` (envelope stripped). */
export type CenterHoursWeek = IpcResponse<'centerHours.get'>['week'];

/**
 * The week the planner renders for a center that has not saved hours.
 * `centerHours.get` returns an empty array — never `undefined` — on a fresh
 * center, so both empty shapes resolve to the domain's `DEFAULT_WEEKLY_HOURS`
 * (09:00–18:00), the same week the Settings form seeds (SOU-184). A persisted
 * non-empty week passes through unchanged.
 */
export function resolvePersistedWeek(persisted: CenterHoursWeek | undefined): WeekdayHoursInput[] {
  return persisted && persisted.length > 0 ? persisted : [...DEFAULT_WEEKLY_HOURS];
}

/**
 * Builds the seven-row week the form edits, in canonical `WEEKDAYS` order
 * (Sunday → Saturday). A fresh center persists no rows, so every day falls back
 * to the domain's `DEFAULT_WEEKLY_HOURS` (09:00–18:00); a saved center overrides
 * with its stored `windows` (a closed day is an empty list). Keeping the
 * fallback in the domain — not hard-coded here — means the "empty" state and a
 * first save agree by construction.
 */
export function seedWeek(persisted: CenterHoursWeek): WeekdayHoursInput[] {
  return WEEKDAYS.map((dayOfWeek) => {
    const saved = persisted.find((row) => row.dayOfWeek === dayOfWeek);
    if (saved) {
      return { dayOfWeek, windows: saved.windows.map((window) => ({ ...window })) };
    }
    const fallback = DEFAULT_WEEKLY_HOURS.find((row) => row.dayOfWeek === dayOfWeek);
    return { dayOfWeek, windows: fallback?.windows.map((window) => ({ ...window })) ?? [] };
  });
}
