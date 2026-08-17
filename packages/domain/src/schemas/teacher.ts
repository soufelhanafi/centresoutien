import { z } from 'zod';
import { normalizePhone } from '../value-objects/phone-number';
import { hasIdPrefix } from '../value-objects/ids';
import { SUBJECT_ID_PREFIX } from '../entities/subject';
import { NIVEAU_ID_PREFIX } from '../entities/niveau';

/**
 * Teacher input schema — the user-editable fields. The envelope (ULID,
 * centerCode, timestamps, version…), the derived `naturalKey`, and `active` are
 * set by the use case, never by the form.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 * This same schema validates the form (via zodResolver), the IPC boundary, and
 * the use-case input.
 */

export const TEACHER_NAME_MAX = 80;
export const TEACHER_CIN_MAX = 20;
export const TEACHER_PHONE_MAX = 40;
export const TEACHER_EMAIL_MAX = 160;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const localizedName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(TEACHER_NAME_MAX, { message: 'too-long' });

/**
 * Phone is **required** — it anchors duplicate matching — and normalized to E.164
 * via {@link normalizePhone} (`0612345678` → `+212612345678`). Blank fails with
 * `required`; an un-normalizable value fails with the stable `invalid-phone`
 * code. Mirrors the Parent phone field.
 */
const phoneField = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(TEACHER_PHONE_MAX, { message: 'too-long' })
  .transform((v, ctx) => {
    try {
      return normalizePhone(v);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid-phone' });
      return z.NEVER;
    }
  });

/**
 * CIN (Moroccan national ID) is optional: blank, `null`, or omitted collapses to
 * `null`. `null` is accepted as input (not just output) so the schema is
 * idempotent — re-validating an already-parsed value (the IPC boundary validates
 * once, the use case again) never throws. Mirrors the Parent email field's shape.
 */
const cinField = z
  .string()
  .trim()
  .max(TEACHER_CIN_MAX, { message: 'too-long' })
  .transform((v) => (v === '' ? null : v))
  .nullable();

/**
 * Email is optional: blank, `null`, or omitted collapses to `null`; a non-blank
 * value must look like an address. `null` accepted as input for idempotency.
 */
const emailField = z
  .string()
  .trim()
  .max(TEACHER_EMAIL_MAX, { message: 'too-long' })
  .refine((v) => v === '' || EMAIL_RE.test(v), { message: 'invalid-email' })
  .transform((v) => (v === '' ? null : v))
  .nullable();

/**
 * Each subject id must carry the `sub_` prefix — a shape check only, mirroring
 * `studentInputSchema.guardianIds`. The Subjects' actual existence is not verified
 * here (the link is a matching hint until SOU-48 makes it load-bearing).
 */
const subjectId = z
  .string()
  .refine((value) => hasIdPrefix(value, SUBJECT_ID_PREFIX), { message: 'invalid-id' });

/** Each niveau id must carry the `niv_` prefix — a shape check only, mirroring
 *  `subjectIds`; existence is not verified here. */
const niveauId = z
  .string()
  .refine((value) => hasIdPrefix(value, NIVEAU_ID_PREFIX), { message: 'invalid-id' });

export const teacherInputSchema = z.object({
  name: z.object({ fr: localizedName, ar: localizedName }),
  cin: cinField.optional().transform((v) => v ?? null),
  phone: phoneField,
  email: emailField.optional().transform((v) => v ?? null),
  subjectIds: z.array(subjectId).default([]),
  // Mirrors `subjectIds`: arrays are full-replacement fields, so an omitted
  // value defaults to `[]` (never `undefined`) — the same explicit semantics a
  // caller omitting `subjectIds` already gets.
  niveauIds: z.array(niveauId).default([]),
});

export type TeacherInput = z.infer<typeof teacherInputSchema>;
