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

/** A payment id's shape at any IPC/domain boundary — exported so callers outside this
 * file (e.g. the receipt print/export IPC contract) validate the same way voiding does,
 * instead of falling back to a bare `z.string()`. */
export const paymentRef = z
  .string()
  .refine((value) => hasIdPrefix(value, PAYMENT_ID_PREFIX), { message: 'invalid-id' });

/** SOU-101: cash-desk annotation, e.g. "chèque n°1234". Mirrors the CIN/email fields'
 *  optional-collapses-to-null shape (`teacher.ts`) — blank, `null`, or omitted all
 *  collapse to `null`; `null` is accepted as input for idempotent re-validation. */
const PAYMENT_NOTE_MAX = 500;
const noteField = z
  .string()
  .trim()
  .max(PAYMENT_NOTE_MAX, { message: 'too-long' })
  .transform((v) => (v === '' ? null : v))
  .nullable();

/**
 * Recording a payment against an invoice. `amountMad` is **positive** integer centimes:
 * a 0 payment is meaningless, and reversals are never recorded through this schema
 * (they are appended by `VoidPayment`). Whether a below-balance amount is allowed is a
 * plan gate (`core.invoicing.partial-paid`, Pro+); whether it exceeds the balance at
 * all (`PaymentExceedsBalanceError`) is a hard block — both enforced in the use case,
 * not here.
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
  note: noteField.optional().transform((v) => v ?? null),
});
export type RecordPaymentFields = z.infer<typeof recordPaymentSchema>;

/**
 * Voiding a payment. `paymentId` names the target; `paidOn` is the **local business
 * day** the void happens on, threaded from the renderer (SOU-244) exactly like
 * `recordPaymentSchema` — the reversal must net against the same day `getDayTakings`
 * shows, and the domain Clock is UTC envelope time only, never a source of local dates.
 * The reversal's amount, method, and `reversesPaymentId` are still derived by the use case.
 */
export const voidPaymentSchema = z.object({
  paymentId: paymentRef,
  paidOn: z.string().trim().refine(isCalendarDate, { message: 'invalid-date' }),
});
export type VoidPaymentFields = z.infer<typeof voidPaymentSchema>;
