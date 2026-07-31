import { z } from 'zod';
import { isCalendarDate } from './student';

/**
 * Holiday input schema — the user-editable fields when creating or editing a
 * Holiday (its bilingual name, `kind`, and inclusive date range). The envelope
 * (ULID, centerCode, timestamps, version…) and the `affectsInvoicing = false`
 * invariant are set by the use case, never by the form.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 * This same schema validates form input (via zodResolver), the IPC boundary, and
 * the use-case input.
 *
 * Dates are strict `YYYY-MM-DD` civil dates validated by {@link isCalendarDate}
 * (real month/day, leap-year aware). A single-day holiday sets `startDate ===
 * endDate`; the range must not run backwards (`end-before-start`). String
 * comparison is chronological for this format, so a cross-year range like
 * `2026-12-24 → 2027-01-04` is accepted (its `endDate` is later).
 */

export const HOLIDAY_NAME_MAX = 80;

const localizedName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(HOLIDAY_NAME_MAX, { message: 'too-long' });

const calendarDate = z
  .string()
  .trim()
  .refine(isCalendarDate, { message: 'invalid-date' });

export const holidayInputSchema = z
  .object({
    name: z.object({ fr: localizedName, ar: localizedName }),
    kind: z.enum(['fixed', 'lunar'], { message: 'invalid-holiday-kind' }),
    startDate: calendarDate,
    endDate: calendarDate,
  })
  .superRefine((value, ctx) => {
    // Only compare once both are well-formed — otherwise `invalid-date` already
    // fired on the offending field and a range check would be noise.
    if (isCalendarDate(value.startDate) && isCalendarDate(value.endDate) && value.endDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end-before-start', path: ['endDate'] });
    }
  });

export type HolidayInput = z.infer<typeof holidayInputSchema>;
