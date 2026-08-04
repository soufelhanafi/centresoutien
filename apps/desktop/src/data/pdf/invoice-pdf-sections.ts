import { rgb } from 'pdf-lib';
import type { InvoicePdfInput, InvoicePdfLine, PaymentStatus } from '@centresoutien/domain';
import { formatMad } from './format-mad';
import { formatDateObjectLabel } from './format-date';
import { formatMonthLabel, formatMonthEndLabel } from './format-month';
import { BRAND_TEAL, MUTED_GRAY, type PdfBadgeColors } from './invoice-pdf-writer';
import { bilingualLabel, type PdfRenderContext } from './invoice-pdf-context';

/** Mirrors the renderer's `invoiceStatusTone`: `cancelled` outranks paid-ness,
 *  `draft` does not (a draft invoice can already be paid). */
type InvoiceTone = PaymentStatus | 'cancelled';

const BADGE_COLORS: Record<InvoiceTone, PdfBadgeColors> = {
  unpaid: { background: rgb(1, 0.96, 0.86), text: rgb(0.66, 0.42, 0.05) },
  'partially-paid': { background: rgb(0.91, 0.96, 1), text: rgb(0.13, 0.36, 0.85) },
  paid: { background: rgb(0.9, 0.97, 0.93), text: rgb(0.08, 0.46, 0.28) },
  cancelled: { background: rgb(0.99, 0.92, 0.92), text: rgb(0.72, 0.17, 0.17) },
};

function invoiceTone(input: InvoicePdfInput): InvoiceTone {
  return input.status === 'cancelled' ? 'cancelled' : input.paymentStatus;
}

function toneLabel(ctx: PdfRenderContext, tone: InvoiceTone): string {
  return tone === 'cancelled' ? ctx.labels.cancelledStatus : ctx.labels.paymentStatus[tone];
}

/** Top band: center identity on the start side, document identity + status on the end side. */
export function drawHeaderBlock(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels, locale } = ctx;
  const topY = writer.y;
  writer.text(input.center.name, { size: 14, bold: true, color: BRAND_TEAL });
  writer.text(input.center.address, { size: 9, color: MUTED_GRAY });
  writer.text(`${input.center.phone} · ${input.center.email}`, { size: 9, color: MUTED_GRAY });
  const startBottom = writer.y;

  writer.y = topY;
  writer.text(labels.invoiceTitle, { size: 20, bold: true, align: 'end' });
  writer.badge(toneLabel(ctx, invoiceTone(input)), BADGE_COLORS[invoiceTone(input)]);
  writer.text(`${labels.invoiceNumber}: ${input.invoiceId}`, { size: 9, color: MUTED_GRAY, align: 'end' });
  if (input.issuedAt !== null) {
    writer.text(`${labels.issuedOn} ${formatDateObjectLabel(input.issuedAt, locale)}`, {
      size: 9,
      color: MUTED_GRAY,
      align: 'end',
    });
  }
  writer.y = Math.min(writer.y, startBottom);
  writer.moveDown(6);
}

/** The billed-to / period / due-date block under the header rule. */
export function drawBillTo(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.hr();
  writer.twoColumns(
    [
      { value: labels.billedTo, size: 8, color: MUTED_GRAY },
      { value: bilingualLabel(input.student, locale), size: 12, bold: true },
    ],
    [
      { value: labels.period, size: 8, color: MUTED_GRAY },
      { value: formatMonthLabel(input.month, locale) },
      { value: labels.dueDate, size: 8, color: MUTED_GRAY },
      { value: formatMonthEndLabel(input.month, locale) },
    ],
  );
  writer.moveDown(6);
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
  writer.moveDown(4);
  writer.text(section.title, { size: 11, bold: true, color: BRAND_TEAL });
  writer.moveDown(2);
  writer.row(labels.descriptionColumn, labels.amountColumn, { size: 8, color: MUTED_GRAY });
  writer.rule();
  for (const line of section.lines) {
    writer.row(bilingualLabel(line.label, locale), formatMad(line.amountMad, locale));
  }
  writer.moveDown(2);
  writer.row(labels.subtotal, formatMad(section.subtotalMad, locale), { bold: true });
  writer.moveDown(8);
}

export function drawTotals(ctx: PdfRenderContext, input: InvoicePdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.hr();
  writer.row(labels.total, formatMad(input.totalMad, locale), { size: 13, bold: true });
  writer.moveDown(2);
  writer.row(labels.paid, formatMad(input.netPaidMad, locale));
  writer.row(labels.outstanding, formatMad(input.outstandingMad, locale), { bold: true });
}

export function drawFooter(ctx: PdfRenderContext): void {
  ctx.writer.moveDown(24);
  ctx.writer.text(ctx.labels.footer, { size: 9, color: MUTED_GRAY, align: 'center' });
}
