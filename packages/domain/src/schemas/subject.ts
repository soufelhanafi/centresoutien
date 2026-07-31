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

const localizedName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
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

export const subjectInputSchema = z.object({
  name: z.object({
    fr: localizedName,
    ar: localizedName,
  }),
  code: subjectCode,
});

export type SubjectInput = z.infer<typeof subjectInputSchema>;
