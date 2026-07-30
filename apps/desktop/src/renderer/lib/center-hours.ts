import { DEFAULT_WEEKLY_HOURS, WEEKDAYS, type WeekdayHoursInput } from '@centresoutien/domain';
import type { IpcResponse } from '../../shared/ipc/contract';

/** The persisted week as returned by `centerHours.get` (envelope stripped). */
export type CenterHoursWeek = IpcResponse<'centerHours.get'>['week'];

/**
 * Builds the seven-row week the form edits, in canonical `WEEKDAYS` order
 * (Sunday → Saturday). A fresh center persists no rows, so every day falls back
 * to the domain's `DEFAULT_WEEKLY_HOURS` (09:00–18:00); a saved center overrides
 * with its stored `open`/`close` (a closed day is `null`/`null`). Keeping the
 * fallback in the domain — not hard-coded here — means the "empty" state and a
 * first save agree by construction.
 */
export function seedWeek(persisted: CenterHoursWeek): WeekdayHoursInput[] {
  return WEEKDAYS.map((dayOfWeek) => {
    const saved = persisted.find((row) => row.dayOfWeek === dayOfWeek);
    if (saved) {
      return { dayOfWeek, open: saved.open, close: saved.close };
    }
    const fallback = DEFAULT_WEEKLY_HOURS.find((row) => row.dayOfWeek === dayOfWeek);
    return { dayOfWeek, open: fallback?.open ?? null, close: fallback?.close ?? null };
  });
}
