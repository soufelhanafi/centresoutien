import { rgb } from 'pdf-lib';
import type { ParentStatementPdfInput, ParentStatementPdfChild } from '@centresoutien/domain';
import { formatMad } from './format-mad';
import { BRAND_TEAL, MUTED_GRAY } from './invoice-pdf-writer';
import type { InvoiceLayoutWriter } from './invoice-layout-writer';
import type { PdfOutlineColors } from './invoice-layout-writer';
import { invoicePdfLabels } from './invoice-pdf-labels';
import { drawLineSection } from './invoice-pdf-sections';
import type { PdfRenderContext } from './invoice-pdf-context';
import type { ParentStatementPdfLabels } from './parent-statement-pdf-labels';

const CURRENCY = 'MAD';

// Mirrors the per-student invoice's outline palette (`invoice-pdf-sections.ts`);
// redeclared here rather than imported so the SOU-279 invoice path stays untouched.
const GREEN: PdfOutlineColors = { border: rgb(0.09, 0.5, 0.32), text: rgb(0.06, 0.42, 0.27) };
const AMBER: PdfOutlineColors = { border: rgb(0.72, 0.5, 0.05), text: rgb(0.62, 0.42, 0.03) };
const RED: PdfOutlineColors = { border: rgb(0.7, 0.2, 0.2), text: rgb(0.6, 0.15, 0.15) };

/** Bundles the statement's cursor with its own labels — one parameter per drawer. */
export type ParentStatementPdfContext = {
  writer: InvoiceLayoutWriter;
  labels: ParentStatementPdfLabels;
};

function mad(amountMad: number): string {
  return formatMad(amountMad, 'fr', CURRENCY);
}

/** The reused line-section drawer keys off the shared invoice labels (identical
 *  column + kind-section copy), so child blocks get the same typography as an
 *  invoice's line items without copying the drawer. */
function lineSectionContext(writer: InvoiceLayoutWriter): PdfRenderContext {
  return { writer, labels: invoicePdfLabels };
}

type StatusBadge = { label: string; colors: PdfOutlineColors };

function aggregateBadge(ctx: ParentStatementPdfContext, input: ParentStatementPdfInput): StatusBadge {
  const { labels } = ctx;
  switch (input.aggregateStatus) {
    case 'paid':
      return { label: labels.paidBadge, colors: GREEN };
    case 'partially-paid':
      return { label: labels.partialBadge, colors: AMBER };
    case 'unpaid':
      return { label: labels.unpaidBadge, colors: RED };
  }
}

function childBadge(
  ctx: ParentStatementPdfContext,
  child: ParentStatementPdfChild,
): StatusBadge | null {
  const { labels } = ctx;
  if (child.invoiceStatus === 'cancelled') return { label: labels.cancelledBadge, colors: RED };
  switch (child.paymentStatus) {
    case 'paid':
      return { label: labels.paidBadge, colors: GREEN };
    case 'partially-paid':
      return { label: labels.partialBadge, colors: AMBER };
    case 'unpaid':
      return { label: labels.unpaidBadge, colors: RED };
  }
}

/** Top band: `Facture` title + aggregate status pill on the start edge (the logo
 *  is drawn on the end edge by the renderer). */
export function drawStatementHeader(
  ctx: ParentStatementPdfContext,
  input: ParentStatementPdfInput,
): void {
  const { writer, labels } = ctx;
  writer.text(labels.title, { size: 24, bold: true, color: BRAND_TEAL });
  const badge = aggregateBadge(ctx, input);
  writer.outlinedBadge(badge.label, badge.colors, { align: 'start' });
  writer.moveDown(10);
}

/** Center identity (start edge) opposite the responsible guardian (end edge),
 *  then the billed month. */
export function drawStatementParties(
  ctx: ParentStatementPdfContext,
  input: ParentStatementPdfInput,
): void {
  const { writer, labels } = ctx;
  writer.twoColumns(
    [
      { value: input.center.name, size: 12, bold: true, color: BRAND_TEAL },
      { value: input.center.address, size: 9, color: MUTED_GRAY },
      { value: `${input.center.phone} · ${input.center.email}`, size: 9, color: MUTED_GRAY },
    ],
    [
      { value: labels.billedTo, size: 8, color: MUTED_GRAY },
      { value: input.parentName, size: 11, bold: true },
    ],
  );
  writer.text(labels.monthLabel(input.month), { size: 9, color: MUTED_GRAY });
  writer.moveDown(12);
}

/** One child block: the child's name + its own invoice number and status pill,
 *  then the kind-grouped line items with subtotals and the child's own total. A
 *  child with no invoice renders « Aucune facture » in place of the line items. */
export function drawChildBlock(
  ctx: ParentStatementPdfContext,
  child: ParentStatementPdfChild,
): void {
  const { writer, labels } = ctx;
  writer.moveDown(4);
  writer.text(child.childName.fr, { size: 13, bold: true });

  if (child.invoiceId === null) {
    writer.text(labels.noInvoice, { size: 10, color: MUTED_GRAY });
    writer.moveDown(8);
    return;
  }

  writer.text(labels.childInvoiceNumber(child.invoiceId), { size: 8, color: MUTED_GRAY });
  const badge = childBadge(ctx, child);
  if (badge !== null) writer.outlinedBadge(badge.label, badge.colors, { align: 'start' });
  writer.moveDown(2);

  const lineCtx = lineSectionContext(writer);
  drawLineSection(lineCtx, {
    title: invoicePdfLabels.regularSection,
    lines: child.regularLines,
    subtotalMad: child.regularSubtotalMad,
  });
  drawLineSection(lineCtx, {
    title: invoicePdfLabels.examPrepSection,
    lines: child.examPrepLines,
    subtotalMad: child.examPrepSubtotalMad,
  });
  writer.row(labels.childSubtotal, mad(child.childTotalMad), { bold: true, color: BRAND_TEAL });
  writer.moveDown(8);
}

/** Right-aligned grand-total block whose tail changes by aggregate status: unpaid
 *  ends at `Total général à régler`; partial/paid unwind through `Règlement reçu`
 *  to `Solde à régler` — the sums across all the child blocks. */
export function drawGrandTotal(
  ctx: ParentStatementPdfContext,
  input: ParentStatementPdfInput,
): void {
  const { writer, labels } = ctx;
  writer.moveDown(4);
  writer.totalsRule();

  if (input.aggregateStatus === 'unpaid') {
    writer.totalsRow(labels.grandTotalDue, mad(input.grandTotalMad), { size: 13, bold: true });
    return;
  }

  writer.totalsRow(labels.grandTotal, mad(input.grandTotalMad), { size: 11 });
  writer.totalsRow(labels.paymentReceived, `-${mad(input.totalReceivedMad)}`, { color: MUTED_GRAY });
  writer.totalsRule();
  writer.totalsRow(labels.balanceDue, mad(input.outstandingMad), { size: 13, bold: true });
}

export function drawStatementFooter(ctx: ParentStatementPdfContext): void {
  const { writer, labels } = ctx;
  writer.moveDown(24);
  writer.text(labels.footerThanks, { size: 9, color: MUTED_GRAY, align: 'center' });
  writer.text(labels.pageLabel(1, 1), { size: 8, color: MUTED_GRAY, align: 'center' });
}
