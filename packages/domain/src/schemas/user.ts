import { z } from 'zod';
import { USERNAME_MIN, USERNAME_MAX, PASSWORD_MAX } from './admin-account';

// User-management input schemas (SOU-252). As across the domain, messages are
// stable error codes, not user-facing strings: the renderer resolves each via
// `t(\`errors.${code}\`)` so the domain stays i18n-agnostic. Plaintext passwords
// and setup codes are validated here, hashed by the use case, and never stored.

const username = z
  .string()
  .trim()
  .min(USERNAME_MIN, { message: 'username-too-short' })
  .max(USERNAME_MAX, { message: 'username-too-long' });

// Password strength for a redeemed setup code. Mirrors the owner's account schema
// (min length + character-class variety) so every credential in the center meets
// the same bar.
const strongPassword = z
  .string()
  .min(8, { message: 'password-too-short' })
  .max(PASSWORD_MAX, { message: 'password-too-long' })
  .regex(/[a-z]/, { message: 'password-needs-lowercase' })
  .regex(/[A-Z]/, { message: 'password-needs-uppercase' })
  .regex(/[0-9]/, { message: 'password-needs-digit' });

// Fields the director supplies to invite an employee: a username and a role. The
// role is bounded as a non-empty string here and validated in the use case —
// known (fail-closed, SOU-95) AND invitable (secretary only, not owner/admin) — so
// the invite path can never mint a privileged role. One home for the role check.
export const createUserInputSchema = z.object({
  username,
  role: z.string().trim().min(1, { message: 'role-required' }),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// Fields an invited employee supplies at first login: their username, the one-time
// setup code, and the password they choose. The setup code is only bounded (never
// re-checked against password strength — it is a system-minted token, not a user
// secret).
export const redeemSetupCodeInputSchema = z.object({
  username,
  setupCode: z.string().trim().min(1, { message: 'setup-code-required' }).max(64, {
    message: 'setup-code-too-long',
  }),
  newPassword: strongPassword,
});

export type RedeemSetupCodeInput = z.infer<typeof redeemSetupCodeInputSchema>;
