import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors `admin.changePassword` raises (SOU-31 settings page), as the
 * renderer must handle them. `InvalidCurrentPasswordError` and
 * `AdminAccountNotFoundError` carry no explicit domain `.code`, so the
 * dispatcher falls back to the class name as the decoded code (see
 * `resolveDomainErrorCode`); the renderer maps that to a localized line via
 * `t(\`errors.${code}\`)` — same pattern as `mapSessionWriteError`.
 *
 * `newPassword` failing the shared strength schema (`changeAdminPasswordSchema`,
 * re-validated server-side by the IPC dispatcher — see
 * `apps/desktop/src/main/ipc/dispatcher.ts`) is a defense-in-depth path: the
 * client's own `zodResolver` already blocks a weak password before submit, so
 * this is only reachable by a non-form caller. It's a Zod validation error, not
 * a `DomainError`, so it never goes through the dispatcher's domain-error
 * encoding — the five strength codes below are matched directly against the
 * raw ZodError message, which already carries them verbatim as issue codes.
 */
export type ChangePasswordErrorCode =
  | 'invalid-current-password'
  | 'admin-account-not-found'
  | 'password-too-short'
  | 'password-too-long'
  | 'password-needs-lowercase'
  | 'password-needs-uppercase'
  | 'password-needs-digit';

const DECODED_CODE_TO_RENDERER_CODE: Readonly<Record<string, ChangePasswordErrorCode>> = {
  InvalidCurrentPasswordError: 'invalid-current-password',
  AdminAccountNotFoundError: 'admin-account-not-found',
};

/** Zod issue codes for `newPassword`'s strength rule — route to that field, never a toast. */
export const NEW_PASSWORD_ERROR_CODES: ReadonlySet<ChangePasswordErrorCode> = new Set([
  'password-too-short',
  'password-too-long',
  'password-needs-lowercase',
  'password-needs-uppercase',
  'password-needs-digit',
]);

/**
 * Narrows a caught `admin.changePassword` rejection to a
 * {@link ChangePasswordErrorCode}, or `null` for an unrelated failure the
 * caller should toast generically.
 */
export function mapChangePasswordError(error: unknown): ChangePasswordErrorCode | null {
  const code = resolveDomainErrorCode(error);
  if (code !== null && code in DECODED_CODE_TO_RENDERER_CODE) {
    return DECODED_CODE_TO_RENDERER_CODE[code] ?? null;
  }
  const message = error instanceof Error ? error.message : String(error);
  for (const zodCode of NEW_PASSWORD_ERROR_CODES) {
    if (message.includes(zodCode)) return zodCode;
  }
  return null;
}
