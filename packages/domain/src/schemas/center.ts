import { z } from 'zod';

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
  phone: optionalText(CENTER_PHONE_MAX),
  email: emailField,
});

export type CenterProfileInput = z.infer<typeof centerProfileSchema>;

// --- Logo upload ---------------------------------------------------------

/** Image types accepted for the center logo. */
export const LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'] as const;
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
