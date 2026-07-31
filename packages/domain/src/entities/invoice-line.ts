import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { InvoiceId } from './invoice';
import type { GroupKind } from './group';

/** ULID id prefix for invoice lines: `invl_01HW…`. */
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
 * `formulaId` is a soft string reference, not a branded `FormulaId`, on purpose: the
 * Formula entity (SOU-60) is not merged yet, and the KICKOFF locked this line to not
 * hard-depend on it. When SOU-60 lands, tighten the brand and the schema prefix.
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
 * Immutable after the invoice is `issued`: there is no line-update path in the
 * repository port — lines are inserted once with the draft and thereafter read-only,
 * so they can never conflict at sync. Not people-like: no `naturalKey`.
 */
export type InvoiceLine = EntityEnvelope & {
  readonly id: InvoiceLineId;
  readonly invoiceId: InvoiceId;
  readonly formulaId: string; // formula ref snapshot (soft ref until SOU-60 brands it)
  readonly label: { fr: string; ar: string }; // formula name snapshot, bilingual
  readonly kind: GroupKind; // 'regular' | 'exam-prep' — the billed track
  readonly amountMad: number; // integer centimes, line total after discount
};
