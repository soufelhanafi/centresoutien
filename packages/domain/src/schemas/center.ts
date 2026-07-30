import { z } from 'zod';
import { normalizePhone } from '../value-objects/phone-number';

/**
 * Center profile input schemas — the user-editable fields of the center row.
 * The envelope, `id`, and `plan` are never set through these forms (plan is
 * seeded once at creation; see the Center entity).
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 * The same schemas validate the form (via zodResolver) and the use-case input.
 */

export const CENTER_NAME_MAX = 120;
export const CENTER_ADDRESS_MAX = 240;
export const CENTER_PHONE_MAX = 40;
export const CENTER_EMAIL_MAX = 160;
export const CENTER_LOGO_PATH_MAX = 260;

/** Optional contact/address fields collapse to `''` when blank — never null in the row. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: 'too-long' })
    .default('');

/**
 * Phone collapses to `''` when blank; otherwise it is normalized to E.164 via the
 * {@link normalizePhone} value object (`0612345678` → `+212612345678`). A value
 * that cannot be normalized fails with the stable `invalid-phone` code. Storing
 * the canonical form is what makes parents-first duplicate matching (phone anchor)
 * work across devices.
 */
const phoneField = z
  .string()
  .trim()
  .max(CENTER_PHONE_MAX, { message: 'too-long' })
  .transform((v, ctx) => {
    if (v === '') return '';
    try {
      return normalizePhone(v);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid-phone' });
      return z.NEVER;
    }
  })
  .default('');

const emailField = z
  .string()
  .trim()
  .max(CENTER_EMAIL_MAX, { message: 'too-long' })
  // Loose on purpose (low-tech directors): blank is fine; a non-blank value must
  // merely look like an address. Format lives here, not the DB.
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'invalid-email' })
  .default('');

export const centerProfileSchema = z.object({
  name: z.string().trim().min(1, { message: 'required' }).max(CENTER_NAME_MAX, { message: 'too-long' }),
  address: optionalText(CENTER_ADDRESS_MAX),
  phone: phoneField,
  email: emailField,
});

export type CenterProfileInput = z.infer<typeof centerProfileSchema>;

// --- Logo upload ---------------------------------------------------------

/**
 * Image types accepted for the center logo. `svg` is deliberately excluded — an
 * SVG can carry script, and the stored logo is re-served to the renderer.
 */
export const LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
export type LogoExtension = (typeof LOGO_EXTENSIONS)[number];

/** 2 MiB ceiling — a logo, not a photo library. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const logoUploadSchema = z.object({
  extension: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v): v is LogoExtension => (LOGO_EXTENSIONS as readonly string[]).includes(v), {
      message: 'unsupported-logo-type',
    }),
  byteLength: z.number().int().positive().max(LOGO_MAX_BYTES, { message: 'logo-too-large' }),
});
