import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { PARENT_ID_PREFIX } from '../entities/student';
import { NIVEAU_ID_PREFIX } from '../entities/niveau';

/**
 * Student input schema — the user-editable fields when creating a Student. The
 * envelope (ULID, centerCode, timestamps, version…) and the derived `naturalKey`
 * are set by the use case, never by the form.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 * This same schema validates form input (via zodResolver) and use-case input.
 */

export const STUDENT_NAME_MAX = 80;
export const STUDENT_LEVEL_MAX = 40;
export const STUDENT_SCHOOL_MAX = 120;
export const STUDENT_NOTES_MAX = 2000;

const localizedName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(STUDENT_NAME_MAX, { message: 'too-long' });

/** Days in a Gregorian month — pure arithmetic, no `Date` (the domain reads time
 *  only through the Clock port; this validates a static literal, not "now"). */
function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

/** True when `value` is a real calendar date in strict `YYYY-MM-DD` form. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

const birthDate = z
  .string()
  .trim()
  .refine(isCalendarDate, { message: 'invalid-date' });

/** Optional free text: trimmed, length-capped, and empty collapses to `null`. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { message: 'too-long' })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null);
}

const guardianId = z
  .string()
  .refine((value) => hasIdPrefix(value, PARENT_ID_PREFIX), { message: 'invalid-id' });

/**
 * Optional Niveau reference (SOU-260): absent, `null`, or blank collapses to
 * `null` ("not classified yet"); a present value must carry the `niv_` prefix —
 * a shape check only, mirroring `guardianIds`. The Niveau's actual existence is
 * not verified here; `ArchiveNiveau` guards the reverse direction. Optional (not
 * defaulted) so pre-SOU-260 callers that omit it keep compiling — the use case
 * stores `null`.
 */
const niveauId = z
  .string()
  .nullable()
  .refine((value) => value === null || hasIdPrefix(value, NIVEAU_ID_PREFIX), {
    message: 'invalid-id',
  })
  .optional();

export const studentInputSchema = z.object({
  name: z.object({ fr: localizedName, ar: localizedName }),
  birthDate,
  // Free-text grade label — legacy (SOU-260). The typed axis is `niveauId`;
  // `level` stays for backward-compatible display but is no longer required.
  level: z
    .string()
    .trim()
    .max(STUDENT_LEVEL_MAX, { message: 'too-long' })
    .default(''),
  school: optionalText(STUDENT_SCHOOL_MAX),
  notes: optionalText(STUDENT_NOTES_MAX),
  guardianIds: z.array(guardianId).default([]),
  niveauId,
});

export type StudentInput = z.infer<typeof studentInputSchema>;

/**
 * Input for the `SetStudentGuardians` partial-update channel: only the
 * `guardianIds` link plus the caller's last-seen `version`, never the rest of
 * `studentInputSchema`. Keeping this schema narrow is the point — it is what
 * stops a stale full-`StudentInput` replay from reverting unrelated fields.
 */
export const setStudentGuardiansInputSchema = z.object({
  guardianIds: z.array(guardianId),
  expectedVersion: z.number().int().nonnegative(),
});

export type SetStudentGuardiansFields = z.infer<typeof setStudentGuardiansInputSchema>;
