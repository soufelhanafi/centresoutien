import { z } from 'zod';
import {
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  TIME_OF_DAY_REGEX,
  WEEKDAYS,
  type WeekdayIndex,
} from '@centresoutien/domain';
import { timeToMinutes } from '../planning/time-range';
import type { CenterHoursOverrideInput, TimeWindow } from './override-view';

/**
 * Client-side validation for the dated-override form (SOU-165). It mirrors the
 * domain rule set so the user sees errors before the save round-trips: every
 * window's close is after its open, a day's windows are ordered and never
 * overlap (the mid-day iftar gap is the space *between* two windows, not an
 * overlap), and the date range's end is on or after its start. Messages are
 * stable **error codes**, resolved by `FieldMessage` via `t('errors.<code>')`,
 * so the schema stays i18n-agnostic.
 *
 * The form models the week as an ordered seven-row array (Sunday first) for
 * React Hook Form's nested field arrays; {@link overrideFormToInput} folds it
 * back into the domain's `hoursByWeekday` record at the save boundary.
 */

const timeString = z.string().regex(TIME_OF_DAY_REGEX, { message: 'invalid-time' });

const timeWindowSchema = z
  .object({ open: timeString, close: timeString })
  .superRefine((window, ctx) => {
    if (timeToMinutes(window.close) <= timeToMinutes(window.open)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'close-before-open', path: ['close'] });
    }
  });

const weekdayWindowsSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    windows: z.array(timeWindowSchema),
  })
  .superRefine((day, ctx) => {
    for (let i = 1; i < day.windows.length; i += 1) {
      const previous = day.windows[i - 1];
      const current = day.windows[i];
      if (previous === undefined || current === undefined) continue;
      if (timeToMinutes(current.open) < timeToMinutes(previous.close)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'windows-overlap',
          path: ['windows', i, 'open'],
        });
      }
    }
  });

export const overrideFormSchema = z
  .object({
    startDate: z.string().min(1, { message: 'required' }),
    endDate: z.string().min(1, { message: 'required' }),
    days: z.array(weekdayWindowsSchema).length(7),
  })
  .superRefine((values, ctx) => {
    if (values.startDate !== '' && values.endDate !== '' && values.endDate < values.startDate) {
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

/** Folds the ordered seven-row form back into the domain's `hoursByWeekday` record. */
export function overrideFormToInput(values: OverrideFormValues): CenterHoursOverrideInput {
  const hoursByWeekday = {} as Record<WeekdayIndex, readonly TimeWindow[]>;
  for (const day of values.days) {
    hoursByWeekday[day.dayOfWeek as WeekdayIndex] = day.windows.map((window) => ({
      open: window.open,
      close: window.close,
    }));
  }
  return {
    dateRange: { start: values.startDate, end: values.endDate },
    hoursByWeekday,
  };
}
