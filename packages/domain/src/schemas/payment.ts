import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { INVOICE_ID_PREFIX } from '../entities/invoice';
import { PAYMENT_ID_PREFIX, PAYMENT_METHODS } from '../entities/payment';
import { isCalendarDate } from './student';

/**
 * Payment input schemas — the shape the domain re-validates before appending to the
 * ledger (the domain is the authority even when a form validates first). The envelope
 * (ULID, centerCode, timestamps, version…), `kind`, and `reversesPaymentId` are set by
 * the use case, never by the caller — a recorded row is always born `kind: 'payment'`.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

const invoiceRef = z
  .string()
  .refine((value) => hasIdPrefix(value, INVOICE_ID_PREFIX), { message: 'invalid-id' });

const paymentRef = z
  .string()
  .refine((value) => hasIdPrefix(value, PAYMENT_ID_PREFIX), { message: 'invalid-id' });

/**
 * Recording a payment against an invoice. `amountMad` is **positive** integer centimes:
 * a 0 payment is meaningless, and reversals are never recorded through this schema
 * (they are appended by `VoidPayment`). Whether a below-balance amount is allowed is a
 * plan gate (`core.invoicing.partial-paid`, Pro+), enforced in the use case — not here.
 */
export const recordPaymentSchema = z.object({
  invoiceId: invoiceRef,
  amountMad: z
    .number({ error: 'invalid-amount' })
    .int({ message: 'invalid-amount' })
    .positive({ message: 'invalid-amount' }),
  method: z.enum(PAYMENT_METHODS, { error: 'invalid-method' }),
  // The business date the money changed hands, a real 'YYYY-MM-DD' calendar date.
  paidOn: z.string().trim().refine(isCalendarDate, { message: 'invalid-date' }),
});
export type RecordPaymentFields = z.infer<typeof recordPaymentSchema>;

/** Voiding a payment: only the target payment id; the reversal's fields are derived. */
export const voidPaymentSchema = z.object({
  paymentId: paymentRef,
});
export type VoidPaymentFields = z.infer<typeof voidPaymentSchema>;
