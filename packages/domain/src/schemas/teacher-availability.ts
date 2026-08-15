import { z } from 'zod';
import { dateRangeInputSchema, hoursByWeekdaySchema, toTimeWindow } from './center-hours-override';
import type { WeeklyTimeWindows } from '../entities/center-hours-override';

/**
 * Teacher-availability input schemas (SOU-259) — the user-editable shapes of a
 * teacher's weekly windows and one-off absences. The envelope (ULID,
 * centerCode, timestamps, version…) and the entity `id` on update are set by
 * the use case, never by the form. Messages are stable **error codes** resolved
 * by the renderer via `t(\`errors.${code}\`)`, and the weekday/window/date
 * validation is shared verbatim with the SOU-165 center-hours-override schema —
 * one definition of "a valid week of windows", no drift.
 */

export const teacherAvailabilityInputSchema = z.object({
  teacherId: z.string().min(1, { message: 'required' }),
  weeklyWindows: hoursByWeekdaySchema,
});

export type TeacherAvailabilityInput = z.infer<typeof teacherAvailabilityInputSchema>;

export const teacherAvailabilityExceptionInputSchema = z.object({
  teacherId: z.string().min(1, { message: 'required' }),
  dateRange: dateRangeInputSchema,
  label: z.string().trim().max(120, { message: 'too-long' }).nullable(),
});

export type TeacherAvailabilityExceptionInput = z.infer<
  typeof teacherAvailabilityExceptionInputSchema
>;

/** Brand every weekday's validated window list, preserving the `0..6` keyed shape. */
export function toWeeklyTimeWindows(
  weeklyWindows: TeacherAvailabilityInput['weeklyWindows'],
): WeeklyTimeWindows {
  return {
    0: weeklyWindows[0].map(toTimeWindow),
    1: weeklyWindows[1].map(toTimeWindow),
    2: weeklyWindows[2].map(toTimeWindow),
    3: weeklyWindows[3].map(toTimeWindow),
    4: weeklyWindows[4].map(toTimeWindow),
    5: weeklyWindows[5].map(toTimeWindow),
    6: weeklyWindows[6].map(toTimeWindow),
  };
}
