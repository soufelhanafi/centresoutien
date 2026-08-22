import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors the formula write channels raise (SOU-62), as the renderer must
 * handle them. The domain throws these with a stable `code` — including the two
 * `FormulaSubjectUnavailableError` reasons, which the domain already encodes as
 * distinct codes (`formula-subject-not-found` / `formula-subject-inactive`)
 * rather than one class the renderer must further disambiguate. The renderer
 * decodes the code from the IPC rejection (see `resolveDomainErrorCode`) and
 * localizes a fixed line via `t(\`errors.${code}\`)`. Mirrors
 * `mapSubjectWriteError`.
 */
export type FormulaWriteErrorCode =
  | 'formula-immutable'
  | 'formula-not-found'
  | 'formula-subject-not-found'
  | 'formula-subject-inactive'
  // SOU-298 — the per-subject price map's server-side rejections
  // (`InvalidFormulaSubjectPricesError`), mirrored so a rejected save reads like
  // the live client validation.
  | 'formula-subject-prices-sum-mismatch'
  | 'formula-subject-prices-coverage-mismatch'
  | 'formula-subject-prices-invalid-amount';

const CODES = new Set<string>([
  'formula-immutable',
  'formula-not-found',
  'formula-subject-not-found',
  'formula-subject-inactive',
  'formula-subject-prices-sum-mismatch',
  'formula-subject-prices-coverage-mismatch',
  'formula-subject-prices-invalid-amount',
] satisfies FormulaWriteErrorCode[]);

/**
 * Narrows a caught formula write rejection to a {@link FormulaWriteErrorCode},
 * or `null` for an unrelated failure that should toast generically.
 */
export function mapFormulaWriteError(error: unknown): FormulaWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as FormulaWriteErrorCode) : null;
}
