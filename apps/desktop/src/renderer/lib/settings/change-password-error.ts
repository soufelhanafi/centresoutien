/**
 * The errors `admin.changePassword` raises (SOU-31 settings page), as the
 * renderer must handle them. The domain throws these; their **class name does
 * not survive the Electron IPC boundary as a structured field**, so the
 * renderer matches on the error's class name (carried in the serialized
 * message) and localizes a fixed line via `t(\`errors.${code}\`)` — same
 * pattern as `mapSessionWriteError` (see `lib/planning/session-write-error.ts`).
 */
export type ChangePasswordErrorCode = 'invalid-current-password' | 'admin-account-not-found';

const ERROR_NAME_TO_CODE: Readonly<Record<string, ChangePasswordErrorCode>> = {
  InvalidCurrentPasswordError: 'invalid-current-password',
  AdminAccountNotFoundError: 'admin-account-not-found',
};

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
  return null;
}
