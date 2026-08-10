import { z } from 'zod';
import {
  areOrderedNonOverlappingWindows,
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  isCalendarDate,
  isValidTimeWindow,
  TIME_OF_DAY_REGEX,
  WEEKDAYS,
  type TimeOfDay,
  type WeekdayIndex,
} from '@centresoutien/domain';
import type { CenterHoursOverrideInput, HoursByWeekday, TimeWindow } from './override-view';

/**
 * Client-side validation for the dated-override form (SOU-165). It reuses the
 * domain's own predicates — `isCalendarDate` for the range and
 * `areOrderedNonOverlappingWindows` for each day's windows — so the form's rules
 * are the *same* code the `centerHoursOverride.save` use case enforces, never a
 * re-implementation. Any window defect (close ≤ open, overlap, out-of-order)
 * surfaces the single `windows-overlap` code, exactly as the domain schema does.
 *
 * The form models the week as an ordered seven-row array (Sunday first) because
 * React Hook Form's typed `FieldPath`/`useFieldArray` don't address the domain
 * input's `0..6`-keyed `hoursByWeekday` record; {@link overrideFormToInput} folds
 * the array back into that record at the save boundary, which the domain then
 * re-validates through the very same schema.
 *
 * Unlike the domain schema (which folds every window defect into a single
 * `windows-overlap` code), the form splits the defect so each error lands where
 * the user can act on it (SOU-165 QA S2a/S2b): a malformed window (`close ≤ open`)
 * attaches to that window's `close` field as `invalid-time`, while a genuine
 * overlap or out-of-order pair attaches to the day's window list as
 * `windows-overlap`. The domain remains the authority; this only routes the same
 * failures to renderable field paths.
 */

const timeString = z.string().regex(TIME_OF_DAY_REGEX, { message: 'invalid-time' });

const timeWindowFormSchema = z.object({ open: timeString, close: timeString });

const weekdayFormSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    windows: z.array(timeWindowFormSchema),
  })
  .superRefine((day, ctx) => {
    const windows = day.windows.map((window) => ({
      open: window.open as TimeOfDay,
      close: window.close as TimeOfDay,
    }));
    windows.forEach((window, windowIndex) => {
      if (!isValidTimeWindow(window)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'invalid-time',
          path: ['windows', windowIndex, 'close'],
        });
      }
    });
    const everyWindowWellFormed = windows.every(isValidTimeWindow);
    if (everyWindowWellFormed && !areOrderedNonOverlappingWindows(windows)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'windows-overlap', path: ['windows'] });
    }
  });

const dateField = z.string().refine(isCalendarDate, { message: 'invalid-date' });

export const overrideFormSchema = z
  .object({
    startDate: dateField,
    endDate: dateField,
    days: z.array(weekdayFormSchema).length(7),
  })
  .superRefine((values, ctx) => {
    if (isCalendarDate(values.startDate) && isCalendarDate(values.endDate) && values.endDate < values.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end-before-start', path: ['endDate'] });
    }
  });

export type OverrideFormValues = z.infer<typeof overrideFormSchema>;

/** A fresh window seeded from the domain defaults (09:00–18:00) when a day opens. */
export function defaultWindow(): TimeWindow {
  return { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
}

/** Blank create-form state: an empty date range and every weekday closed. */
export function emptyOverrideForm(): OverrideFormValues {
  return {
    startDate: '',
    endDate: '',
    days: WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, windows: [] })),
  };
}

/** Folds the ordered seven-row form into the domain's `hoursByWeekday` record + date range. */
export function overrideFormToInput(values: OverrideFormValues): CenterHoursOverrideInput {
  const hoursByWeekday = {} as Record<WeekdayIndex, TimeWindow[]>;
  for (const day of values.days) {
    hoursByWeekday[day.dayOfWeek as WeekdayIndex] = day.windows.map((window) => ({
      open: window.open,
      close: window.close,
    }));
  }
  return {
    dateRange: { start: values.startDate, end: values.endDate },
    hoursByWeekday: hoursByWeekday as HoursByWeekday,
  };
}
