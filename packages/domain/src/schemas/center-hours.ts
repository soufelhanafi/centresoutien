import { z } from 'zod';
import { TIME_OF_DAY_REGEX, toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import { isValidTimeWindow, type TimeWindow } from '../value-objects/time-window';
import { WEEKDAYS, type WeekdayIndex } from '../value-objects/weekday';

/**
 * Center-hours input schemas — the user-editable shape of the weekly grid. The
 * envelope (ULID, centerCode, timestamps, version…) is set by the use case,
 * never by the form. Messages are stable **error codes**, not user-facing
 * strings, so the domain stays i18n-agnostic and the renderer resolves each via
 * `t(\`errors.${code}\`)`. This schema validates the form (zodResolver), the IPC
 * boundary, and the use-case input.
 *
 * A weekday's `windows` is an ordered, non-overlapping list of 24-hour
 * `'HH:mm'` ranges (SOU-197): one window is a plain single-shift day, two model
 * the mid-day break, and an empty list means closed that day. Windows are
 * validated per-entry (`close > open`, code `invalid-window`) and as a list —
 * out-of-order (`windows-not-sorted`) or overlapping (`overlapping-windows`)
 * lists are rejected. Overnight ranges are rejected — a center day never
 * crosses midnight.
 */

const timeString = z.string().regex(TIME_OF_DAY_REGEX, { message: 'invalid-time' });

const windowSchema = z.object({ open: timeString, close: timeString });

const windowsListSchema = z.array(windowSchema).superRefine((windows, ctx) => {
  const parsed: TimeWindow[] = windows.map((window) => ({
    open: window.open as TimeOfDay,
    close: window.close as TimeOfDay,
  }));
  if (parsed.some((window) => !isValidTimeWindow(window))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid-window' });
    return;
  }
  for (let i = 1; i < parsed.length; i += 1) {
    const previous = parsed[i - 1]!;
    const current = parsed[i]!;
    if (toMinutes(current.open) < toMinutes(previous.open)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'windows-not-sorted' });
      return;
    }
    if (toMinutes(current.open) < toMinutes(previous.close)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'overlapping-windows' });
      return;
    }
  }
});

export const weekdayHoursSchema = z.object({
  dayOfWeek: z
    .number()
    .int({ message: 'invalid-weekday' })
    .min(0, { message: 'invalid-weekday' })
    .max(6, { message: 'invalid-weekday' }),
  windows: windowsListSchema,
});

export type WeekdayHoursInput = z.infer<typeof weekdayHoursSchema>;

/** The full week: exactly seven rows, one per distinct weekday `0..6`. */
export const weeklyHoursSchema = z
  .array(weekdayHoursSchema)
  .length(7, { message: 'incomplete-week' })
  .superRefine((rows, ctx) => {
    const days = new Set(rows.map((row) => row.dayOfWeek));
    if (days.size !== 7) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'incomplete-week' });
    }
  });

export type WeeklyHoursInput = z.infer<typeof weeklyHoursSchema>;

/** Default opening window the Settings/wizard form seeds from before the user saves. */
export const DEFAULT_WINDOW = { open: '09:00', close: '18:00' } as const;

/**
 * A fresh center has no saved rows (the migration backfills nothing). The domain
 * — not the UI — owns the default week the form shows for review before the
 * first save: every day open 09:00–18:00, adjusted by the user.
 */
export const DEFAULT_WEEKLY_HOURS: readonly WeekdayHoursInput[] = WEEKDAYS.map(
  (dayOfWeek: WeekdayIndex) => ({ dayOfWeek, windows: [DEFAULT_WINDOW] }),
);
