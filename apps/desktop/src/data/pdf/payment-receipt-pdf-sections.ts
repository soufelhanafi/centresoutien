import type { PaymentReceiptPdfInput } from '@centresoutien/domain';
import type { InvoicePdfWriter } from './invoice-pdf-writer';
import { bilingualLabel } from './pdf-bilingual';
import { formatMad } from './format-mad';
import { formatMonthLabel } from './format-month';
import { formatDateLabel } from './format-date';
import { BRAND_TEAL } from './invoice-pdf-writer';
import type { PaymentReceiptPdfLabels } from './payment-receipt-pdf-labels';

/** Bundles the three things every section-drawing function needs, mirroring
 *  `PdfRenderContext` / `PayslipRenderContext` (component-size-limits: max 3 params). */
export type PaymentReceiptRenderContext = {
  writer: InvoicePdfWriter;
  labels: PaymentReceiptPdfLabels;
  locale: 'fr' | 'ar';
};

export function drawPaymentReceiptMeta(ctx: PaymentReceiptRenderContext, input: PaymentReceiptPdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.text(`${labels.receiptTitle} — ${labels.kindLabel[input.kind]}`, { size: 20, bold: true, color: BRAND_TEAL });
  writer.moveDown(4);
  writer.row(labels.receiptNumber, input.paymentId);
  writer.row(labels.invoiceNumber, input.invoiceId);
  writer.row(labels.month, formatMonthLabel(input.month, locale));
  writer.row(labels.student, bilingualLabel(input.student, locale));
  writer.moveDown(10);
}

export function drawPaymentReceiptDetails(ctx: PaymentReceiptRenderContext, input: PaymentReceiptPdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.hr();
  writer.row(labels.amount, formatMad(input.amountMad, locale), { bold: true, size: 12 });
  writer.row(labels.methodLabel, labels.method[input.method]);
  writer.row(labels.paidOn, formatDateLabel(input.paidOn, locale));
  if (input.note) {
    writer.moveDown(6);
    writer.text(`${labels.note}: ${input.note}`, { size: 9 });
  }
}

export function drawPaymentReceiptFooter(ctx: PaymentReceiptRenderContext): void {
  ctx.writer.moveDown(20);
  ctx.writer.text(ctx.labels.footer, { size: 9 });
}
