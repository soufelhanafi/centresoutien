import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { InvoiceId } from './invoice';
import type { GroupKind } from './group';
import type { FormulaId } from './formula';

/**
 * Id prefix for invoice lines. Not a random ULID: a line's id is
 * `deriveInvoiceLineId(invoiceId, formulaId, kind)` — `invl_<invoiceId>_<formulaId>_<kind>` —
 * so two devices independently appending the same not-yet-billed `(formulaId, kind)`
 * line to the same draft compute the identical id instead of double-billing it.
 */
export const INVOICE_LINE_ID_PREFIX = 'invl';

export type InvoiceLineId = Brand<string, 'InvoiceLineId'>;

/**
 * One line of a monthly invoice — a **frozen snapshot** of a single charge
 * (CLAUDE.md §7). Billing is per active `StudentSubscription`, so there is one line
 * per subscription/formula that month, never per group and never per session; groups
 * never appear on an invoice.
 *
 * The snapshot is the whole point: `label` (the formula's bilingual name at issue
 * time), `formulaId` (the reference it came from), `kind`, and `amountMad` are
 * copied onto the line and never re-read from the live Formula — a later price or
 * name change on the Formula can therefore never mutate an already-billed invoice.
 * `formulaId` is branded `FormulaId` (tightened from a soft string ref now that the
 * Formula entity exists, SOU-60/KICKOFF) — it is still only a provenance breadcrumb,
 * never dereferenced by this entity or its policies.
 *
 * Lines are their own rows (not embedded JSON on the invoice) so dashboard KPIs and
 * teacher-fee attribution can filter/read them by `kind` at the query level. `kind`
 * is the shared regular / exam-prep track (same values as {@link GroupKind}); the
 * regular and exam-prep lines are grouped in separate invoice subsections.
 *
 * `amountMad` is the line total **after discount**, in integer MAD centimes
 * (1 MAD = 100), matching the money-column convention; a future `Money` value object
 * handles display. Never negative (a 100 %-discount line is `0`).
 *
 * Mutable only while the invoice is `draft` (doctrine relaxed by SOU-289): a draft
 * may gain a line (mid-month enrollment) and a draft line's `amountMad` may be
 * corrected by the director — both through draft-only repository methods. Once the
 * invoice is `issued` (or `cancelled`) the billed fields (`formulaId` / `label` /
 * `kind` / `amountMad`) are frozen forever, so issued lines can never conflict at sync.
 * The one post-freeze exception is the envelope tombstone: discarding an invoice
 * cascades `deletedAt` onto its lines, so a line read in isolation is trustworthy for
 * *deletes*.
 * A `cancelled` invoice is different — it is a lifecycle state, not a delete, so its
 * lines stay live; any cross-invoice, kind-level line aggregate must therefore still
 * exclude lines whose header status is `cancelled`. Not people-like: no `naturalKey`.
 */
export type InvoiceLine = EntityEnvelope & {
  readonly id: InvoiceLineId;
  readonly invoiceId: InvoiceId;
  readonly formulaId: FormulaId; // formula ref snapshot — provenance only, never dereferenced
  readonly label: { fr: string; ar: string }; // formula name snapshot, bilingual
  readonly kind: GroupKind; // 'regular' | 'exam-prep' — the billed track
  readonly amountMad: number; // integer centimes, line total after discount
};
