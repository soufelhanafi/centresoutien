import { rgb, type Color } from 'pdf-lib';
import type { InvoicePdfInput, InvoicePdfLine, PaymentStatus } from '@centresoutien/domain';
import { formatMad } from './format-mad';
import { formatDateObjectLabel } from './format-date';
import { formatMonthEndLabel } from './format-month';
import { BRAND_TEAL, MUTED_GRAY } from './invoice-pdf-writer';
import type { PdfOutlineColors } from './invoice-layout-writer';
import type { PdfRenderContext } from './invoice-pdf-context';

const CURRENCY = 'MAD';

/** The invoice's whole visible state, in one tone. `cancelled` outranks
 *  paid-ness (a cancelled invoice is never "paid"); `draft` only adds a marker
 *  pill and otherwise follows the derived payment status. */
type InvoiceTone = PaymentStatus | 'cancelled';

const GREEN: PdfOutlineColors = { border: rgb(0.09, 0.5, 0.32), text: rgb(0.06, 0.42, 0.27) };
const AMBER: PdfOutlineColors = { border: rgb(0.72, 0.5, 0.05), text: rgb(0.62, 0.42, 0.03) };
const RED: PdfOutlineColors = { border: rgb(0.7, 0.2, 0.2), text: rgb(0.6, 0.15, 0.15) };
const GRAY: PdfOutlineColors = { border: MUTED_GRAY, text: MUTED_GRAY };

function mad(amountMad: number): string {
  return formatMad(amountMad, 'fr', CURRENCY);
}

function invoiceTone(input: InvoicePdfInput): InvoiceTone {
  return input.status === 'cancelled' ? 'cancelled' : input.paymentStatus;
}

function dueDateLabel(input: InvoicePdfInput): string {
  return formatMonthEndLabel(input.month, 'fr');
}

type StatusPill = { label: string; colors: PdfOutlineColors };

function statusPill(ctx: PdfRenderContext, input: InvoicePdfInput): StatusPill | null {
  const { labels } = ctx;
  if (input.status === 'cancelled') return { label: labels.cancelledBadge, colors: RED };
  if (input.status === 'draft') return { label: labels.draftBadge, colors: GRAY };
  if (input.paymentStatus === 'paid') return { label: labels.paidBadge, colors: GREEN };
  if (input.paymentStatus === 'partially-paid') return { label: labels.partialBadge, colors: AMBER };
  return null;
}

/** Top band: `Facture` title + status pill on the start edge (the logo is drawn
 *  on the end edge by the renderer). */
export function drawHeaderBlock(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels } = ctx;
  writer.text(labels.invoiceTitle, { size: 24, bold: true, color: BRAND_TEAL });
  const pill = statusPill(ctx, input);
  if (pill !== null) writer.outlinedBadge(pill.label, pill.colors, { align: 'start' });
  writer.moveDown(10);
}

/** The three-cell meta grid under the title. */
export function drawMetaGrid(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels } = ctx;
  const issueValue = input.issuedAt !== null ? formatDateObjectLabel(input.issuedAt, 'fr') : '—';
  writer.metaGrid([
    { label: labels.invoiceNumber, value: input.invoiceId },
    { label: labels.issueDate, value: issueValue },
    { label: labels.dueDate, value: dueDateLabel(input) },
  ]);
  writer.moveDown(10);
}

/** Center identity (start edge) opposite the billed-to party (end edge). */
export function drawParties(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels } = ctx;
  writer.twoColumns(
    [
      { value: input.center.name, size: 12, bold: true, color: BRAND_TEAL },
      { value: input.center.address, size: 9, color: MUTED_GRAY },
      { value: `${input.center.phone} · ${input.center.email}`, size: 9, color: MUTED_GRAY },
    ],
    [
      { value: labels.billedTo, size: 8, color: MUTED_GRAY },
      { value: labels.parentOf(input.student.fr), size: 11, bold: true },
    ],
  );
  writer.moveDown(14);
}

type Banner = { text: string; color: Color | undefined };

function banner(ctx: PdfRenderContext, input: InvoicePdfInput): Banner {
  const { labels } = ctx;
  switch (invoiceTone(input)) {
    case 'cancelled':
      return { text: labels.bannerCancelled, color: RED.text };
    case 'paid':
      return { text: labels.bannerPaid(mad(input.totalMad)), color: GREEN.text };
    case 'partially-paid':
      return { text: labels.bannerPartial(mad(input.outstandingMad)), color: AMBER.text };
    case 'unpaid':
      return { text: labels.bannerUnpaid(mad(input.totalMad), dueDateLabel(input)), color: undefined };
  }
}

/** The large, status-dependent amount line above the line items. */
export function drawAmountBanner(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer } = ctx;
  const { text, color } = banner(ctx, input);
  writer.text(text, { size: 15, bold: true, ...(color !== undefined ? { color } : {}) });
  writer.moveDown(12);
}

export type LineSectionInput = {
  title: string;
  lines: readonly InvoicePdfLine[];
  subtotalMad: number;
};

/** One kind's subsection (regular or exam-prep) — omitted entirely when the
 *  invoice has no lines of that kind, never rendered as an empty heading. */
export function drawLineSection(ctx: PdfRenderContext, section: LineSectionInput): void {
  if (section.lines.length === 0) return;
  const { writer, labels } = ctx;
  writer.moveDown(4);
  writer.text(section.title, { size: 11, bold: true, color: BRAND_TEAL });
  writer.moveDown(2);
  writer.row(labels.descriptionColumn, labels.amountColumn, { size: 8, color: MUTED_GRAY });
  writer.rule();
  for (const line of section.lines) {
    writer.row(line.label.fr, mad(line.amountMad));
  }
  writer.moveDown(2);
  writer.row(labels.subtotal, mad(section.subtotalMad), { bold: true });
  writer.moveDown(8);
}

/** Right-aligned totals block whose tail changes by status (SOU-93-derived):
 *  unpaid ends at `Total à régler`; partial/paid unwind through `Règlement reçu`
 *  to `Solde à régler`; cancelled shows the frozen `Total` only. */
export function drawTotals(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels } = ctx;
  const tone = invoiceTone(input);
  writer.moveDown(4);
  writer.totalsRule();

  if (tone === 'cancelled') {
    writer.totalsRow(labels.total, mad(input.totalMad), { size: 12, bold: true });
    return;
  }
  if (tone === 'unpaid') {
    writer.totalsRow(labels.totalDue, mad(input.totalMad), { size: 13, bold: true });
    return;
  }

  writer.totalsRow(labels.total, mad(input.totalMad), { size: 11 });
  writer.totalsRow(labels.paymentReceived, `-${mad(input.netPaidMad)}`, { color: MUTED_GRAY });
  writer.totalsRule();
  writer.totalsRow(labels.balanceDue, mad(input.outstandingMad), { size: 13, bold: true });
}

export function drawFooter(ctx: PdfRenderContext): void {
  const { writer, labels } = ctx;
  writer.moveDown(24);
  writer.text(labels.footerThanks, { size: 9, color: MUTED_GRAY, align: 'center' });
  writer.text(labels.pageLabel(1, 1), { size: 8, color: MUTED_GRAY, align: 'center' });
}
