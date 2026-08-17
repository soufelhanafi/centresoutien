import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors the niveau write channels raise (SOU-260), as the renderer must
 * handle them. The domain throws these with a stable `code`; the renderer
 * decodes it from the IPC rejection (see `resolveDomainErrorCode`) and localizes
 * a fixed line via `t(\`errors.${code}\`)`. Mirrors `mapSubjectWriteError`.
 */
export type NiveauWriteErrorCode =
  | 'niveau-in-use'
  | 'niveau-not-found'
  | 'duplicate-niveau-code';

const CODES = new Set<string>([
  'niveau-in-use',
  'niveau-not-found',
  'duplicate-niveau-code',
] satisfies NiveauWriteErrorCode[]);

/**
 * Narrows a caught niveau write rejection to a {@link NiveauWriteErrorCode} so
 * the caller can react specifically (e.g. show the duplicate-code error inline),
 * or `null` for an unrelated failure that should toast generically.
 */
export function mapNiveauWriteError(error: unknown): NiveauWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as NiveauWriteErrorCode) : null;
}
