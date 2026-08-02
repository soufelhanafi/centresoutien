import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors the subject write channels raise (SOU-46/SOU-47/SOU-124), as the
 * renderer must handle them. The domain throws these with a stable `code`; the
 * renderer decodes it from the IPC rejection (see `resolveDomainErrorCode`) and
 * localizes a fixed line via `t(\`errors.${code}\`)` — never by reading any other
 * field off the error. Mirrors `mapSessionWriteError`.
 */
export type SubjectWriteErrorCode = 'subject-in-use' | 'subject-not-found' | 'duplicate-subject-code';

const CODES = new Set<string>([
  'subject-in-use',
  'subject-not-found',
  'duplicate-subject-code',
] satisfies SubjectWriteErrorCode[]);

/**
 * Narrows a caught subject write rejection to a {@link SubjectWriteErrorCode} so
 * the caller can react specifically (e.g. show the delete-blocked view instead of
 * a generic toast), or `null` for an unrelated failure that should toast
 * generically.
 */
export function mapSubjectWriteError(error: unknown): SubjectWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as SubjectWriteErrorCode) : null;
}
