import { z } from 'zod';
import { TIME_OF_DAY_REGEX, type TimeOfDay } from '../value-objects/time-of-day';
import { areOrderedNonOverlappingWindows, type TimeWindow } from '../value-objects/time-window';
import { isCalendarDate } from './student';

/**
 * Center-hours-override input schema (SOU-165) — the user-editable shape of a
 * Ramadan-style temporary schedule. The envelope (ULID, centerCode, timestamps,
 * version…) and the entity `id` on update are set by the use case, never by the
 * form. Messages are stable **error codes**, not user-facing strings, so the
 * domain stays i18n-agnostic and the renderer resolves each via
 * `t(\`errors.${code}\`)`. This schema validates the form (zodResolver), the IPC
 * boundary, and the use-case input.
 *
 * `dateRange` is an inclusive `YYYY-MM-DD` civil range (`end >= start`).
 * `hoursByWeekday` is keyed `0..6` (Sunday…Saturday), each an ordered,
 * non-overlapping window list — an empty list is a closed day. Any malformed
 * window (`close <= open`), overlap, or out-of-order pair fails one check and
 * surfaces the single `windows-overlap` error code (matching the renderer's
 * client-side validation). Times are 24-hour `'HH:mm'`; a window never crosses
 * midnight.
 */

const timeString = z.string().regex(TIME_OF_DAY_REGEX, { message: 'invalid-time' });

export const timeWindowSchema = z.object({
  open: timeString,
  close: timeString,
});

/** Brand a regex-validated `{ open, close }` string pair into a {@link TimeWindow}. */
export function toTimeWindow(window: { open: string; close: string }): TimeWindow {
  return { open: window.open as TimeOfDay, close: window.close as TimeOfDay };
}

const windowListSchema = z.array(timeWindowSchema).superRefine((windows, ctx) => {
  const parsed = windows.map(toTimeWindow);
  // One check covers all three defects — malformed window (close <= open),
  // overlap, and out-of-order — reported under the single `windows-overlap` code.
  if (!areOrderedNonOverlappingWindows(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'windows-overlap' });
  }
});

const calendarDate = z
  .string()
  .trim()
  .refine(isCalendarDate, { message: 'invalid-date' });

export const dateRangeInputSchema = z
  .object({ start: calendarDate, end: calendarDate })
  .superRefine((range, ctx) => {
    if (isCalendarDate(range.start) && isCalendarDate(range.end) && range.end < range.start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end-before-start', path: ['end'] });
    }
  });

/** The seven weekday window lists, keyed `0..6` — every day required (a closed day is `[]`). */
export const hoursByWeekdaySchema = z.object({
  0: windowListSchema,
  1: windowListSchema,
  2: windowListSchema,
  3: windowListSchema,
  4: windowListSchema,
  5: windowListSchema,
  6: windowListSchema,
});

export const centerHoursOverrideInputSchema = z.object({
  dateRange: dateRangeInputSchema,
  hoursByWeekday: hoursByWeekdaySchema,
});

export type CenterHoursOverrideInput = z.infer<typeof centerHoursOverrideInputSchema>;
