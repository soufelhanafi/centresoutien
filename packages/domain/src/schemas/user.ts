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

// The staff member's own display name, captured at self-onboarding (SOU-303).
const FULL_NAME_MAX = 120;
const fullName = z
  .string()
  .trim()
  .min(1, { message: 'full-name-required' })
  .max(FULL_NAME_MAX, { message: 'full-name-too-long' });

// The staff member's contact email, mandatory at onboarding and their personal
// password-reset channel (SOU-303). Bounded here; the address SHAPE is validated
// and canonicalized by the Email VO (`normalizeEmail`, code `invalid-email`) in
// the use case, keeping one home for email format rules.
const email = z.string().trim().min(1, { message: 'email-required' });

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

// Direct account creation (single-laptop model): the director sets the new user's
// login credentials in one step — username + password — plus an optional display
// name, and the account is born active (a password is set immediately, no setup
// code to hand over). The employee then signs in with those credentials directly.
// The role is bounded as a non-empty string here and validated in the use case —
// known (fail-closed, SOU-95) AND invitable (secretary only, not owner/admin) — so
// the create path can never mint a privileged role. One home for the role check.
export const createUserInputSchema = z.object({
  role: z.string().trim().min(1, { message: 'role-required' }),
  username,
  password: strongPassword,
  // The director may name the employee for the roster; blank is allowed and stored
  // as no name. Bounded and trimmed here; the use case folds an empty string to null.
  fullName: z.string().trim().max(FULL_NAME_MAX, { message: 'full-name-too-long' }).optional(),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// A setup code the staff present. Only bounded, never re-checked against password
// strength — it is a system-minted token, not a user secret. Reused by the redeem
// and validate flows.
const setupCode = z.string().trim().min(1, { message: 'setup-code-required' }).max(64, {
  message: 'setup-code-too-long',
});

// Fields an invited employee supplies at first login (SOU-303, code-first): the
// one-time setup code (which locates and authorizes the invite — the role is bound
// to it, never self-asserted) plus the identity they choose for themselves —
// username, full name, email — and their password. Case-insensitive username
// uniqueness (SOU-153) and email format are enforced in the use case.
export const redeemSetupCodeInputSchema = z.object({
  setupCode,
  username,
  fullName,
  email,
  newPassword: strongPassword,
});

export type RedeemSetupCodeInput = z.infer<typeof redeemSetupCodeInputSchema>;

// The staff's step-1 payload: the code alone. Validating it resolves the invite and
// returns the role bound to it, BEFORE any identity is collected — the "authorization
// first" half of the code-first flow (SOU-303).
export const validateSetupCodeInputSchema = z.object({ setupCode });

export type ValidateSetupCodeInput = z.infer<typeof validateSetupCodeInputSchema>;

// Recovery redemption (SOU-303): an already-onboarded staff member whose director
// re-issued them a fresh code sets a NEW password only — their username/full
// name/email are already on file and are not re-collected.
export const recoverPasswordWithSetupCodeInputSchema = z.object({
  setupCode,
  newPassword: strongPassword,
});

export type RecoverPasswordWithSetupCodeInput = z.infer<
  typeof recoverPasswordWithSetupCodeInputSchema
>;
