import { z } from 'zod';

/**
 * Subject input schema — the user-editable fields when creating or editing a
 * Subject (its bilingual name and optional code). The envelope (ULID, centerCode,
 * timestamps, version…) and `active` are set by the use case, never by the form.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 * This same schema validates form input (via zodResolver) and use-case input.
 */

export const SUBJECT_NAME_MAX = 80;
export const SUBJECT_CODE_MAX = 16;

/** A subject code starts alphanumeric, then allows alphanumerics, `_`, and `-`. */
export const SUBJECT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;

const frName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(SUBJECT_NAME_MAX, { message: 'too-long' });

// AR is optional-but-length-capped (SOU-271): FR-only data entry is supported,
// so an empty AR name is valid; an over-length one still fails.
const arName = z
  .string()
  .trim()
  .max(SUBJECT_NAME_MAX, { message: 'too-long' });

/**
 * Optional subject code. The form may omit it or send an empty / whitespace-only
 * value — all mean "no code" and normalize to `undefined` (the use case stores
 * `null`). A provided code is trimmed and uppercased here, then length- and
 * charset-checked. Per-center uniqueness is deliberately NOT enforced here: it
 * needs a repository read and lives in `CreateSubject` (`DuplicateSubjectCodeError`).
 */
const subjectCode = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = value?.trim().toUpperCase();
    return normalized === undefined || normalized === '' ? undefined : normalized;
  })
  .pipe(
    z
      .string()
      .max(SUBJECT_CODE_MAX, { message: 'too-long' })
      .regex(SUBJECT_CODE_PATTERN, { message: 'invalid-code' })
      .optional(),
  );

/** The bilingual name block, shared by the create and update schemas so both
 *  enforce the exact same per-locale required + length rules. */
const subjectName = z.object({
  fr: frName,
  ar: arName,
});

export const subjectInputSchema = z.object({
  name: subjectName,
  code: subjectCode,
});

export type SubjectInput = z.infer<typeof subjectInputSchema>;

/**
 * Subject **update** input (SOU-124): the fields `UpdateSubject` may change — the
 * bilingual name and the `active` flag (deactivate **and** reactivate). `code` is
 * deliberately absent: it is a sync-relevant natural key (SOU-122) and is never
 * editable here — a code change is out of scope, not a silent no-op. The envelope
 * (timestamps, version, updatedBy…) is set by the use case, never by the form.
 * Messages are stable error codes; the renderer resolves each via `t(\`errors.${code}\`)`.
 */
export const subjectUpdateInputSchema = z.object({
  name: subjectName,
  active: z.boolean(),
});

export type SubjectUpdateInput = z.infer<typeof subjectUpdateInputSchema>;
