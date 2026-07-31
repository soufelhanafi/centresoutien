import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { InvoiceId } from './invoice';

/** ULID id prefix for payments: `pay_01HW…`. */
export const PAYMENT_ID_PREFIX = 'pay';

export type PaymentId = Brand<string, 'PaymentId'>;

/**
 * A payment is either a real `payment` against an invoice or a `reversal` that voids
 * an earlier one (SOU-93). There is no DELETE/UPDATE: a mistaken payment is corrected
 * by appending a `reversal` that references it, keeping the money ledger append-only
 * and fully auditable (who reversed what, when). Both kinds carry a **non-negative**
 * `amountMad`; the derivation subtracts reversals rather than storing signed amounts,
 * so the `CHECK (amount_mad >= 0)` money convention holds for every row.
 */
export const PAYMENT_KINDS = ['payment', 'reversal'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/** How the money moved. CHECK-constrained at the DB level. */
export const PAYMENT_METHODS = ['cash', 'cheque', 'transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * A single, immutable entry in an invoice's money ledger (SOU-93). Payments are
 * **append-only**: once written a row is never edited or deleted, so two laptops'
 * payments on the same invoice simply *union* at sync with zero conflict — there is
 * no editable scalar to clash on. The invoice's payment status
 * (`unpaid / partially-paid / paid`) is **derived** from the sum of these rows
 * (`derivePaymentStatus`), never stored on the invoice header.
 *
 * Every field is `readonly`: the append-only invariant is enforced at the type level,
 * not just the DB trigger. A `reversal` row voids a prior `payment` via
 * `reversesPaymentId`; a `payment` row has `reversesPaymentId: null`. Net paid is
 * `Σ payments − Σ reversals`.
 *
 * Not people-like, so no `naturalKey` — a payment is identified by its ledger
 * position, not a matching key. The envelope's `deletedAt` exists only for column
 * uniformity; it is **never** set (deletes are reversals, guarded by a DB trigger).
 * `invoiceId` / `reversesPaymentId` are soft references (no FK), so a payment can
 * arrive before its invoice header during a pull without breaking replication.
 *
 * `amountMad` is integer MAD centimes (1 MAD = 100), matching the money-column
 * convention; a future `Money` value object handles display. `paidOn` is the
 * business date the money changed hands, `'YYYY-MM-DD'` — a human date, not a
 * timestamp; sync ordering is decided by `version`, never `paidOn`.
 */
export type Payment = EntityEnvelope & {
  readonly id: PaymentId;
  readonly invoiceId: InvoiceId;
  readonly kind: PaymentKind;
  readonly amountMad: number; // integer centimes, always >= 0 (reversals subtract)
  readonly method: PaymentMethod;
  readonly paidOn: string; // 'YYYY-MM-DD', the business date the money moved
  readonly reversesPaymentId: PaymentId | null; // set on a reversal, null on a payment
};
