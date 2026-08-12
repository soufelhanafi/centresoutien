import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors the payment write channel raises (SOU-101 KICKOFF: overpayment is
 * blocked outright, not clamped). The domain throws `PaymentExceedsBalanceError`
 * with a stable `code`; the renderer decodes it from the IPC rejection (see
 * `resolveDomainErrorCode`) and surfaces it inline on the amount field via
 * `t(\`errors.${code}\`)`. Mirrors `mapFormulaWriteError`.
 */
export type PaymentWriteErrorCode = 'payment-exceeds-balance' | 'invoice-not-payable';

const CODES = new Set<string>([
  'payment-exceeds-balance',
  'invoice-not-payable',
] satisfies PaymentWriteErrorCode[]);

/**
 * Narrows a caught payment write rejection to a {@link PaymentWriteErrorCode},
 * or `null` for an unrelated failure that should toast generically.
 */
export function mapPaymentWriteError(error: unknown): PaymentWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as PaymentWriteErrorCode) : null;
}
