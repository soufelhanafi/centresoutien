import { z } from 'zod';
import { TIME_OF_DAY_REGEX, toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import { areOrderedNonOverlappingWindows, type TimeWindow } from '../value-objects/time-window';
import { WEEKDAYS } from '../value-objects/weekday';
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
 * `hoursByWeekday` carries exactly seven rows, one per distinct weekday `0..6`,
 * each with an ordered, non-overlapping window list — an empty list is a closed
 * day. Times are 24-hour `'HH:mm'`; a window never crosses midnight (`close >
 * open`, enforced inside the ordered-non-overlapping check).
 */

const timeString = z.string().regex(TIME_OF_DAY_REGEX, { message: 'invalid-time' });

export const timeWindowSchema = z.object({
  open: timeString,
  close: timeString,
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

const weekdayWindowsSchema = z
  .object({
    dayOfWeek: z
      .number()
      .int({ message: 'invalid-weekday' })
      .min(0, { message: 'invalid-weekday' })
      .max(6, { message: 'invalid-weekday' }),
    windows: z.array(timeWindowSchema),
  })
  .superRefine((row, ctx) => {
    const windows = row.windows.map(
      (window): TimeWindow => ({ open: window.open as TimeOfDay, close: window.close as TimeOfDay }),
    );
    for (const window of windows) {
      if (toMinutes(window.close) <= toMinutes(window.open)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'close-before-open', path: ['windows'] });
        return;
      }
    }
    if (!areOrderedNonOverlappingWindows(windows)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'windows-overlap', path: ['windows'] });
    }
  });

export type WeekdayWindowsInput = z.infer<typeof weekdayWindowsSchema>;

const hoursByWeekdaySchema = z
  .array(weekdayWindowsSchema)
  .length(7, { message: 'incomplete-week' })
  .superRefine((rows, ctx) => {
    const days = new Set(rows.map((row) => row.dayOfWeek));
    if (days.size !== 7) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'incomplete-week' });
    }
  });

export const centerHoursOverrideInputSchema = z.object({
  dateRange: dateRangeInputSchema,
  hoursByWeekday: hoursByWeekdaySchema,
});

export type CenterHoursOverrideInput = z.infer<typeof centerHoursOverrideInputSchema>;

/** The seven weekday indices in order — the canonical row order the use case emits. */
export const OVERRIDE_WEEKDAYS = WEEKDAYS;
