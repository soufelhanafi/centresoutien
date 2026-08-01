/**
 * The errors `admin.changePassword` raises (SOU-31 settings page), as the
 * renderer must handle them. The domain throws these; their **class name does
 * not survive the Electron IPC boundary as a structured field**, so the
 * renderer matches on the error's class name (carried in the serialized
 * message) and localizes a fixed line via `t(\`errors.${code}\`)` — same
 * pattern as `mapSessionWriteError` (see `lib/planning/session-write-error.ts`).
 *
 * `newPassword` failing the shared strength schema (`changeAdminPasswordSchema`,
 * re-validated server-side by the IPC dispatcher — see
 * `apps/desktop/src/main/ipc/dispatcher.ts`) is a defense-in-depth path: the
 * client's own `zodResolver` already blocks a weak password before submit, so
 * this is only reachable by a non-form caller. It still deserves an inline
 * field error rather than a generic toast, so the five strength codes below
 * are matched the same way — they're the same `password-*` codes the
 * account-creation schema throws, already translated under `errors.*`.
 */
export type ChangePasswordErrorCode =
  | 'invalid-current-password'
  | 'admin-account-not-found'
  | 'password-too-short'
  | 'password-too-long'
  | 'password-needs-lowercase'
  | 'password-needs-uppercase'
  | 'password-needs-digit';

const ERROR_NAME_TO_CODE: Readonly<Record<string, ChangePasswordErrorCode>> = {
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
  const message = error instanceof Error ? error.message : String(error);
  for (const name of Object.keys(ERROR_NAME_TO_CODE)) {
    if (message.includes(name)) return ERROR_NAME_TO_CODE[name] ?? null;
  }
  for (const code of NEW_PASSWORD_ERROR_CODES) {
    if (message.includes(code)) return code;
  }
  return null;
}
