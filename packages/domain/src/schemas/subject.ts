import { z } from 'zod';

/**
 * Subject input schema — the user-editable fields when creating or editing a
 * Subject (its bilingual name). The envelope (ULID, centerCode, timestamps,
 * version…) and `active` are set by the use case, never by the form.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 * This same schema validates form input (via zodResolver) and use-case input.
 */

export const SUBJECT_NAME_MAX = 80;

const localizedName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(SUBJECT_NAME_MAX, { message: 'too-long' });

export const subjectInputSchema = z.object({
  name: z.object({
    fr: localizedName,
    ar: localizedName,
  }),
});

export type SubjectInput = z.infer<typeof subjectInputSchema>;
