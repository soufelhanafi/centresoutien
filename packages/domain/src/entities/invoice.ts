import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { StudentId } from './student';

/** ULID id prefix for invoices: `inv_01HW…`. */
export const INVOICE_ID_PREFIX = 'inv';

export type InvoiceId = Brand<string, 'InvoiceId'>;

/**
 * The stored **lifecycle** states of a monthly invoice (SOU-67). This is the state
 * machine this entity owns: `draft → issued → cancelled`.
 *
 * ⚠️ Paid-ness is deliberately **not** a status here. Payment status
 * (`unpaid / partially-paid / paid`) is *derived* from append-only `Payment`
 * records (SOU-93), never a stored, editable scalar — a stored `paid` flag is a
 * second source of truth that can drift from the money ledger, and an editable
 * status column is a same-field sync clash (forbidden, CLAUDE.md §5). "Mark paid"
 * in the UI inserts a balance `Payment`, it does not flip a flag here.
 */
export const INVOICE_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * A monthly invoice for one student in one calendar `month` (`YYYY-MM`). Exactly
 * one invoice exists per `(studentId, month)` — the `CreateInvoiceDraft` guard
 * enforces this in the domain (no DB unique index, so two laptops that generate the
 * same month before a sync *converge* rather than reject the push, CLAUDE.md §5bis).
 *
 * The invoice header carries no monetary total: the total is a pure function of its
 * immutable {@link InvoiceLine} rows (`invoiceTotalMad`), derived, never stored, so
 * it can never drift from the lines. The lines carry a **frozen snapshot** of what
 * was billed; once the invoice moves to `issued`, neither the header (beyond the one
 * legal status transition to `cancelled`) nor the lines may change — subsequent
 * Formula edits never mutate an existing invoice.
 *
 * `issuedAt` / `cancelledAt` timestamp the two non-draft states (both UTC, from the
 * Clock port; `null` until that state is reached). They are human-facing audit
 * information — sync ordering is decided by `version`, never these wall-clocks.
 *
 * Not people-like, so it carries no `naturalKey` — an invoice is identified by its
 * `(studentId, month)` relationship, not a matching key. Soft-delete only: a draft
 * can be discarded via `deletedAt`; a tombstoned row still syncs.
 */
export type Invoice = EntityEnvelope & {
  readonly id: InvoiceId;
  readonly studentId: StudentId;
  readonly month: string; // 'YYYY-MM', inclusive calendar month
  status: InvoiceStatus;
  issuedAt: Date | null; // set on draft → issued
  cancelledAt: Date | null; // set on → cancelled
};
