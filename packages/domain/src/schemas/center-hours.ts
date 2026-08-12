import { z } from 'zod';
import { TIME_OF_DAY_REGEX, toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import { WEEKDAYS, type WeekdayIndex } from '../value-objects/weekday';
import type { DayHours } from '../policies/session-conflict-policy';
import type { CenterHours } from '../entities/center-hours';

/**
 * Center-hours input schemas — the user-editable shape of the weekly grid. The
 * envelope (ULID, centerCode, timestamps, version…) is set by the use case,
 * never by the form. Messages are stable **error codes**, not user-facing
 * strings, so the domain stays i18n-agnostic and the renderer resolves each via
 * `t(\`errors.${code}\`)`. This schema validates the form (zodResolver), the IPC
 * boundary, and the use-case input.
 *
 * Times are 24-hour `'HH:mm'`; a closed day is `open` and `close` both `null`.
 * Overnight ranges (close ≤ open) are rejected — a center day never crosses
 * midnight.
 */

const timeString = z.string().regex(TIME_OF_DAY_REGEX, { message: 'invalid-time' });

export const weekdayHoursSchema = z
  .object({
    dayOfWeek: z
      .number()
      .int({ message: 'invalid-weekday' })
      .min(0, { message: 'invalid-weekday' })
      .max(6, { message: 'invalid-weekday' }),
    open: timeString.nullable(),
    close: timeString.nullable(),
  })
  .superRefine((row, ctx) => {
    const openSet = row.open !== null;
    const closeSet = row.close !== null;
    // A day is either fully closed (both null) or fully open (both set).
    if (openSet !== closeSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'closed-partial',
        path: [closeSet ? 'open' : 'close'],
      });
      return;
    }
    if (openSet && closeSet && toMinutes(row.close as TimeOfDay) <= toMinutes(row.open as TimeOfDay)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'close-before-open', path: ['close'] });
    }
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

/** Default weekday times the Settings/wizard form seeds from before the user saves. */
export const DEFAULT_OPEN = '09:00';
export const DEFAULT_CLOSE = '18:00';

/**
 * A fresh center has no saved rows (the migration backfills nothing). The domain
 * — not the UI — owns the default week the form shows for review before the
 * first save: every day open 09:00–18:00, adjusted by the user.
 */
export const DEFAULT_WEEKLY_HOURS: readonly WeekdayHoursInput[] = WEEKDAYS.map(
  (dayOfWeek: WeekdayIndex) => ({ dayOfWeek, open: DEFAULT_OPEN, close: DEFAULT_CLOSE }),
);

/**
 * The week the scheduling and audit hours-checks read. When a center has saved
 * its hours those rows are used directly ({@link CenterHours} satisfies
 * {@link DayHours}); before the first save the repository is empty and the domain
 * falls back to the same {@link DEFAULT_WEEKLY_HOURS} the Settings form seeds — so
 * a fresh center reads within the shared default week (09:00–18:00) instead of
 * every day reading as closed. Lives on this leaf module (no use-case imports) so
 * both `weekly-session-scheduling` and `audit-sessions-outside-effective-hours`
 * depend on it without forming an initialization cycle.
 */
export function resolveWeek(rows: readonly CenterHours[]): readonly DayHours[] {
  if (rows.length > 0) return rows;
  return DEFAULT_WEEKLY_HOURS.map((day) => ({
    dayOfWeek: day.dayOfWeek as WeekdayIndex,
    open: day.open as TimeOfDay | null,
    close: day.close as TimeOfDay | null,
  }));
}
