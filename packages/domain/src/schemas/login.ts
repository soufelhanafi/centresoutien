import { z } from 'zod';
import { PASSWORD_MAX } from './admin-account';

/**
 * Login input schema (SOU-27) — the fields the login form captures, shared by
 * the form (zodResolver), the IPC boundary, and the {@link AttemptLogin} use
 * case. Unlike {@link adminCredentialsSchema} this does **not** re-check password
 * strength: login must accept an account created before the policy tightened. It
 * only bounds length — a correct password can never exceed `PASSWORD_MAX`, so a
 * longer input is always wrong and there is no reason to feed it to Argon2.
 *
 * As elsewhere, messages are stable error codes; the renderer resolves each via
 * `t(\`errors.${code}\`)` so the domain stays i18n-agnostic.
 */
export const loginInputSchema = z.object({
  username: z.string().trim().min(1, { message: 'username-required' }),
  password: z.string().min(1, { message: 'password-required' }).max(PASSWORD_MAX, {
    message: 'password-too-long',
  }),
  rememberDevice: z.boolean().default(false),
});

// Input type: `rememberDevice` is optional for callers (the schema defaults it
// to false). The use case parses to the output type where it is always present.
export type LoginInput = z.input<typeof loginInputSchema>;
