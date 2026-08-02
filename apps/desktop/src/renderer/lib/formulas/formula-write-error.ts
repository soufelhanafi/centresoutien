/**
 * The errors the formula write channels raise (SOU-62), as the renderer must
 * handle them. The domain throws these; their **structured fields do not
 * survive the Electron IPC boundary**, so the renderer matches on the error's
 * class name (carried in the serialized message) and localizes a fixed line via
 * `t(\`errors.${code}\`)` — never by reading a field off the error. Mirrors
 * `mapSubjectWriteError`.
 */
export type FormulaWriteErrorCode =
  | 'formula-immutable'
  | 'formula-not-found'
  | 'formula-subject-not-found'
  | 'formula-subject-inactive';

const ERROR_NAME_TO_CODE: Readonly<Record<string, FormulaWriteErrorCode>> = {
  FormulaImmutableError: 'formula-immutable',
  FormulaNotFoundError: 'formula-not-found',
};

/**
 * Narrows a caught formula write rejection to a {@link FormulaWriteErrorCode},
 * or `null` for an unrelated failure that should toast generically. Only
 * `.name` and `.message` survive the Electron IPC boundary — never custom
 * fields like `.code` — so `FormulaSubjectUnavailableError` (one class, two
 * reasons) is disambiguated by the `(not-found)` / `(inactive)` suffix its own
 * message text carries, not by its `.code` property.
 */
export function mapFormulaWriteError(error: unknown): FormulaWriteErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('FormulaSubjectUnavailableError')) {
    return message.includes('(inactive)') ? 'formula-subject-inactive' : 'formula-subject-not-found';
  }
  for (const name of Object.keys(ERROR_NAME_TO_CODE)) {
    if (message.includes(name)) return ERROR_NAME_TO_CODE[name] ?? null;
  }
  return null;
}
