import { z } from 'zod';
import { normalizePhone } from '../value-objects/phone-number';
import { GUARDIAN_RELATIONS } from '../value-objects/guardian-relation';

/**
 * Parent/guardian input schema — the user-editable fields. The envelope (ULID,
 * centerCode, timestamps, version…) and the derived `naturalKey` are set by the
 * use case, never by the form.
 *
 * As with the other schemas, messages are stable **error codes**, not
 * user-facing strings: the domain stays i18n-agnostic and the renderer resolves
 * each code via `t(\`errors.${code}\`)`. This same schema validates the form (via
 * zodResolver), the IPC boundary, and the use-case input.
 */

export const PARENT_NAME_MAX = 120;
export const PARENT_PHONE_MAX = 40;
export const PARENT_EMAIL_MAX = 160;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nameField = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(PARENT_NAME_MAX, { message: 'too-long' });

/**
 * Phone is **required** (it anchors duplicate matching) and normalized to E.164
 * via {@link normalizePhone} (`0612345678` → `+212612345678`). Blank fails with
 * `required`; an un-normalizable value fails with the stable `invalid-phone`
 * code. Storing the canonical form is what makes parents-first matching work
 * across devices. Phone is intentionally not unique — a shared family number is
 * allowed.
 */
const phoneField = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(PARENT_PHONE_MAX, { message: 'too-long' })
  .transform((v, ctx) => {
    try {
      return normalizePhone(v);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid-phone' });
      return z.NEVER;
    }
  });

/**
 * Email is optional: blank, `null`, or omitted collapses to `null`; a non-blank
 * value must look like an address. `null` is accepted as input (not just output)
 * so the schema is idempotent — re-validating an already-parsed value (the IPC
 * boundary validates once, the use case again) never throws.
 */
const emailField = z
  .string()
  .trim()
  .max(PARENT_EMAIL_MAX, { message: 'too-long' })
  .refine((v) => v === '' || EMAIL_RE.test(v), { message: 'invalid-email' })
  .transform((v) => (v === '' ? null : v))
  .nullable();

/** Enum token only — a value outside the closed set fails with `invalid-relation`. */
const relationField = z
  .string()
  .refine(
    (v): v is (typeof GUARDIAN_RELATIONS)[number] =>
      (GUARDIAN_RELATIONS as readonly string[]).includes(v),
    { message: 'invalid-relation' },
  );

export const parentInputSchema = z.object({
  name: nameField,
  phone: phoneField,
  email: emailField.optional().transform((v) => v ?? null),
  relation: relationField,
  whatsappOptIn: z.boolean().default(false),
});

export type ParentInput = z.infer<typeof parentInputSchema>;
