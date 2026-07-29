import { z } from 'zod';

/**
 * Admin credential input schema — the fields captured when creating the admin
 * account (first-run wizard) and re-used by the domain use case. Password
 * strength is min length + character-class variety (SOU-26).
 *
 * As with the Subject schema, messages are stable **error codes**, not
 * user-facing strings: the domain stays i18n-agnostic and the renderer resolves
 * each code via `t(\`errors.${code}\`)`. The plaintext password is validated
 * here, hashed by the use case, and never stored.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 40;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const username = z
  .string()
  .trim()
  .min(USERNAME_MIN, { message: 'username-too-short' })
  .max(USERNAME_MAX, { message: 'username-too-long' });

const password = z
  .string()
  .min(PASSWORD_MIN, { message: 'password-too-short' })
  .max(PASSWORD_MAX, { message: 'password-too-long' })
  .regex(/[a-z]/, { message: 'password-needs-lowercase' })
  .regex(/[A-Z]/, { message: 'password-needs-uppercase' })
  .regex(/[0-9]/, { message: 'password-needs-digit' });

export const adminCredentialsSchema = z.object({
  username,
  password,
});

export type AdminCredentials = z.infer<typeof adminCredentialsSchema>;
