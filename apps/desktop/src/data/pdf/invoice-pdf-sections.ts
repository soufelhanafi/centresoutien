import type { InvoicePdfInput, InvoicePdfLine } from '@centresoutien/domain';
import { formatMad } from './format-mad';
import { formatMonthLabel } from './format-month';
import { BRAND_TEAL } from './invoice-pdf-writer';
import { bilingualLabel, type PdfRenderContext } from './invoice-pdf-context';

export function drawInvoiceMeta(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.text(labels.invoiceTitle, { size: 20, bold: true, color: BRAND_TEAL });
  writer.moveDown(4);
  writer.row(labels.invoiceNumber, input.invoiceId);
  writer.row(labels.month, formatMonthLabel(input.month, locale));
  writer.row(labels.statusLabel, labels.lifecycleStatus[input.status]);
  writer.row(labels.student, bilingualLabel(input.student, locale));
  writer.moveDown(10);
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
  const { writer, labels, locale } = ctx;
  writer.text(section.title, { size: 12, bold: true, color: BRAND_TEAL });
  for (const line of section.lines) {
    writer.row(bilingualLabel(line.label, locale), formatMad(line.amountMad, locale));
  }
  writer.row(labels.subtotal, formatMad(section.subtotalMad, locale), { bold: true });
  writer.moveDown(10);
}

export function drawTotals(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.hr();
  writer.row(labels.total, formatMad(input.totalMad, locale), { bold: true, size: 12 });
  writer.row(labels.paid, formatMad(input.netPaidMad, locale));
  writer.row(labels.outstanding, formatMad(input.outstandingMad, locale), { bold: true });
  writer.text(`${labels.paymentStatusLabel}: ${labels.paymentStatus[input.paymentStatus]}`, {
    size: 10,
  });
}

export function drawFooter(ctx: PdfRenderContext): void {
  ctx.writer.moveDown(20);
  ctx.writer.text(ctx.labels.footer, { size: 9 });
}
