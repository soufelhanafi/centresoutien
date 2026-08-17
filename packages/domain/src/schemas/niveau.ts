import { z } from 'zod';
import { NIVEAU_CATEGORIES } from '../entities/niveau';

/**
 * Niveau input schema — the user-editable fields when creating or editing a
 * Niveau: its bilingual name, optional code, and category. The envelope (ULID,
 * centerCode, timestamps, version…) and `active` are set by the use case, never
 * by the form.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 * This same schema validates form input (via zodResolver) and use-case input.
 */

export const NIVEAU_NAME_MAX = 80;
export const NIVEAU_CODE_MAX = 16;

/** A niveau code starts alphanumeric, then allows alphanumerics, `_`, and `-`. */
export const NIVEAU_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;

const localizedName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(NIVEAU_NAME_MAX, { message: 'too-long' });

/**
 * Optional niveau code. The form may omit it or send an empty / whitespace-only
 * value — all mean "no code" and normalize to `undefined` (the use case stores
 * `null`). A provided code is trimmed and uppercased here, then length- and
 * charset-checked. Per-center uniqueness is deliberately NOT enforced here: it
 * needs a repository read and lives in `CreateNiveau` / `UpdateNiveau`
 * (`DuplicateNiveauCodeError`).
 */
const niveauCode = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = value?.trim().toUpperCase();
    return normalized === undefined || normalized === '' ? undefined : normalized;
  })
  .pipe(
    z
      .string()
      .max(NIVEAU_CODE_MAX, { message: 'too-long' })
      .regex(NIVEAU_CODE_PATTERN, { message: 'invalid-code' })
      .optional(),
  );

/** The bilingual name block, shared by the create and update schemas so both
 *  enforce the exact same per-locale required + length rules. */
const niveauName = z.object({
  fr: localizedName,
  ar: localizedName,
});

export const niveauInputSchema = z.object({
  name: niveauName,
  code: niveauCode,
  category: z.enum(NIVEAU_CATEGORIES, { error: 'invalid-category' }),
});

export type NiveauInput = z.infer<typeof niveauInputSchema>;

/**
 * Niveau **update** input (SOU-260): the fields `UpdateNiveau` may change — the
 * bilingual name, the `code` (editable here, unlike `Subject.code`), the
 * `category`, and the `active` flag (deactivate **and** reactivate, both
 * directions). The envelope (timestamps, version, updatedBy…) is set by the use
 * case, never by the form. Messages are stable error codes; the renderer
 * resolves each via `t(\`errors.${code}\`)`.
 */
export const niveauUpdateInputSchema = z.object({
  name: niveauName,
  code: niveauCode,
  category: z.enum(NIVEAU_CATEGORIES, { error: 'invalid-category' }),
  active: z.boolean(),
});

export type NiveauUpdateInput = z.infer<typeof niveauUpdateInputSchema>;
