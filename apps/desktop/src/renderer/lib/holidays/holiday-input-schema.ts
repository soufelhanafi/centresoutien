import { z } from 'zod';

/**
 * Holiday input schema — the user-editable fields when creating or editing a
 * Holiday (bilingual name, kind, and inclusive date range). The envelope (ULID,
 * centerCode, timestamps, version…) and the `affectsInvoicing: false` invariant
 * are set by the domain use case, never by the form.
 *
 * ## Temporary contract mirror (SOU-30 frontend ↔ domain)
 *
 * This is a faithful mirror of the domain's published `holidayInputSchema`
 * (`[CONTRACT PUBLISHED]` comment on SOU-30, commit `2b2c0c1` on
 * `feature/SOU-30-domain`). It exists so the UI compiles and runs against the
 * mock gateway before the domain branch merges. **At integration, delete this
 * file and import `holidayInputSchema` / `HolidayInput` / `HOLIDAY_NAME_MAX`
 * from `@centresoutien/domain`** — the shapes and error codes are identical, so
 * no form code changes.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(`errors.${code}`)`.
 */

export const HOLIDAY_NAME_MAX = 80;

/** The two holiday kinds — solar (recurs yearly) and lunar (entered per year). */
export const HOLIDAY_KINDS = ['fixed', 'lunar'] as const;

const nameSide = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(HOLIDAY_NAME_MAX, { message: 'too-long' });

/** Strict `YYYY-MM-DD`. Lexicographic order matches chronological order. */
const calendarDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalid-date' })
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00`).getTime()), { message: 'invalid-date' });

export const holidayInputSchema = z
  .object({
    name: z.object({ fr: nameSide, ar: nameSide }),
    // Closed set — a value outside it fails with `invalid-holiday-kind`. An enum
    // keeps the schema's input and output types identical (no refine narrowing),
    // so the form types resolve without an input/output split.
    kind: z.enum(HOLIDAY_KINDS, { error: 'invalid-holiday-kind' }),
    startDate: calendarDate,
    endDate: calendarDate,
  })
  // `endDate` is inclusive and must not precede `startDate`; a single-day holiday
  // has `startDate === endDate`. The error is attached to `endDate` so it renders
  // under that field.
  .refine((v) => v.endDate >= v.startDate, { message: 'end-before-start', path: ['endDate'] });

export type HolidayInput = z.infer<typeof holidayInputSchema>;
