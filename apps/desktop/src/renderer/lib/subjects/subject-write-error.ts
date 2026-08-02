/**
 * The errors the subject write channels raise (SOU-46/SOU-47/SOU-124), as the
 * renderer must handle them. The domain throws these; their **structured fields
 * do not survive the Electron IPC boundary**, so the renderer matches on the
 * error's class name (carried in the serialized message) and localizes a fixed
 * line via `t(\`errors.${code}\`)` — never by reading a field off the error.
 * Mirrors `mapSessionWriteError`.
 */
export type SubjectWriteErrorCode = 'subject-in-use' | 'subject-not-found' | 'duplicate-subject-code';

const ERROR_NAME_TO_CODE: Readonly<Record<string, SubjectWriteErrorCode>> = {
  SubjectInUseError: 'subject-in-use',
  SubjectNotFoundError: 'subject-not-found',
  DuplicateSubjectCodeError: 'duplicate-subject-code',
};

/**
 * Narrows a caught subject write rejection to a {@link SubjectWriteErrorCode} so
 * the caller can react specifically (e.g. show the delete-blocked view instead of
 * a generic toast), or `null` for an unrelated failure that should toast
 * generically.
 */
export function mapSubjectWriteError(error: unknown): SubjectWriteErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  for (const name of Object.keys(ERROR_NAME_TO_CODE)) {
    if (message.includes(name)) return ERROR_NAME_TO_CODE[name] ?? null;
  }
  return null;
}
