import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors `payment.void` raises (SOU-237). `VoidPayment` rejects a reversal of
 * a reversal ({@link cannot-reverse-reversal}), a second reversal of an already
 * reversed payment ({@link payment-already-reversed} — the concurrency guard from
 * SOU-233 surfaces here on a lost race), and an unknown/foreign-center target
 * ({@link payment-not-found}). The renderer decodes the stable `code` from the IPC
 * rejection and toasts `t(\`errors.${code}\`)`. Mirrors `mapPaymentWriteError`.
 */
export type PaymentReversalErrorCode =
  | 'payment-already-reversed'
  | 'cannot-reverse-reversal'
  | 'payment-not-found';

const CODES = new Set<string>([
  'payment-already-reversed',
  'cannot-reverse-reversal',
  'payment-not-found',
] satisfies PaymentReversalErrorCode[]);

/**
 * Narrows a caught `payment.void` rejection to a {@link PaymentReversalErrorCode},
 * or `null` for an unrelated failure that should toast generically.
 */
export function mapPaymentReversalError(error: unknown): PaymentReversalErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as PaymentReversalErrorCode) : null;
}
