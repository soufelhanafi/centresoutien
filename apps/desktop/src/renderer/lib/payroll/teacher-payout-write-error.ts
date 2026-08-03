import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors the payroll confirm channels raise (SOU-76), as the renderer must
 * handle them. `ConfirmTeacherPayout` (the single-row "Marquer payé" action)
 * rejects loudly on a repeat target — a bulk confirm's `skippedAlreadyPaid`
 * count is not an error and needs no mapping here. The renderer decodes the
 * code from the IPC rejection (see `resolveDomainErrorCode`) and localizes a
 * fixed line via `t(\`errors.${code}\`)`. Mirrors `mapFormulaWriteError`.
 */
export type TeacherPayoutWriteErrorCode = 'teacher-payout-not-found' | 'teacher-payout-already-paid';

const CODES = new Set<string>([
  'teacher-payout-not-found',
  'teacher-payout-already-paid',
] satisfies TeacherPayoutWriteErrorCode[]);

/**
 * Narrows a caught payout confirm rejection to a
 * {@link TeacherPayoutWriteErrorCode}, or `null` for an unrelated failure that
 * should toast generically.
 */
export function mapTeacherPayoutWriteError(error: unknown): TeacherPayoutWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as TeacherPayoutWriteErrorCode) : null;
}
