import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors `invoice.updateLineAmount` raises (SOU-289): a non-draft invoice's
 * lines are frozen, the line/invoice may no longer exist, and the schema rejects
 * a non-positive amount. Decoded from the IPC rejection and surfaced via
 * `t(\`errors.${code}\`)`. Mirrors `mapPaymentWriteError`.
 */
export type InvoiceLineWriteErrorCode =
  | 'invoice-not-draft'
  | 'invoice-line-not-found'
  | 'invoice-not-found'
  | 'invalid-amount';

const CODES = new Set<string>([
  'invoice-not-draft',
  'invoice-line-not-found',
  'invoice-not-found',
  'invalid-amount',
] satisfies InvoiceLineWriteErrorCode[]);

/**
 * Narrows a caught line-amount write rejection to a
 * {@link InvoiceLineWriteErrorCode}, or `null` for an unrelated failure that
 * should toast generically.
 */
export function mapInvoiceLineWriteError(error: unknown): InvoiceLineWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as InvoiceLineWriteErrorCode) : null;
}
