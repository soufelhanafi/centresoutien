import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors `invoice.setAllocation` raises (SOU-298): a negative/non-integer
 * amount, a subject listed twice, an all-zero vector, or an unknown invoice.
 * `PlanFeatureUnavailableError` (the `payroll.teacher` gate) is deliberately not
 * mapped here — the control is hidden when the feature is off, so it only ever
 * surfaces via the generic fallback. Decoded from the IPC rejection and shown via
 * `t(\`errors.${code}\`)`. Mirrors `mapInvoiceLineWriteError`.
 */
export type InvoiceAllocationWriteErrorCode =
  | 'invoice-allocation-invalid-amount'
  | 'invoice-allocation-duplicate-subject'
  | 'invoice-allocation-all-zero'
  | 'invoice-not-found';

const CODES = new Set<string>([
  'invoice-allocation-invalid-amount',
  'invoice-allocation-duplicate-subject',
  'invoice-allocation-all-zero',
  'invoice-not-found',
] satisfies InvoiceAllocationWriteErrorCode[]);

/**
 * Narrows a caught allocation write rejection to an
 * {@link InvoiceAllocationWriteErrorCode}, or `null` for an unrelated failure
 * that should toast generically.
 */
export function mapInvoiceAllocationWriteError(error: unknown): InvoiceAllocationWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as InvoiceAllocationWriteErrorCode) : null;
}
