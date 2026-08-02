import type { PayslipPdfInput } from '@centresoutien/domain';
import type { InvoicePdfWriter } from './invoice-pdf-writer';
import { bilingualLabel } from './invoice-pdf-context';
import { formatMad } from './format-mad';
import { formatMonthLabel } from './format-month';
import { BRAND_TEAL } from './invoice-pdf-writer';
import type { PayslipPdfLabels } from './payslip-pdf-labels';

/** Bundles the three things every section-drawing function needs, mirroring
 *  `PdfRenderContext` (component-size-limits: max 3 params). */
export type PayslipRenderContext = {
  writer: InvoicePdfWriter;
  labels: PayslipPdfLabels;
  locale: 'fr' | 'ar';
};

export function drawPayslipMeta(ctx: PayslipRenderContext, input: PayslipPdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.text(labels.payslipTitle, { size: 20, bold: true, color: BRAND_TEAL });
  writer.moveDown(4);
  writer.row(labels.payoutNumber, input.payoutId);
  writer.row(labels.month, formatMonthLabel(input.month, locale));
  writer.row(labels.teacher, bilingualLabel(input.teacher, locale));
  writer.row(labels.statusLabel, labels.lifecycleStatus[input.status]);
  writer.moveDown(10);
}

/** The rule breakdown: the flat amount for `fixed-monthly`, or the attributed
 *  base + percent snapshot for `percentage-of-monthly-fees` — never both, and
 *  never a "0" placeholder for the kind that doesn't apply (KICKOFF). */
export function drawPayslipBreakdown(ctx: PayslipRenderContext, input: PayslipPdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.text(labels.ruleLabel[input.ruleKind], { size: 12, bold: true, color: BRAND_TEAL });
  if (input.ruleKind === 'percentage-of-monthly-fees' && input.baseAmountMad !== null && input.percentSnapshot !== null) {
    writer.row(labels.baseAmount, formatMad(input.baseAmountMad, locale));
    writer.row(labels.percent, `${input.percentSnapshot}%`);
  }
  writer.moveDown(6);
}

export function drawPayslipTotal(ctx: PayslipRenderContext, input: PayslipPdfInput): void {
  const { writer, labels, locale } = ctx;
  writer.hr();
  writer.row(labels.total, formatMad(input.amountMad, locale), { bold: true, size: 12 });
  if (input.notes) {
    writer.moveDown(6);
    writer.text(`${labels.notes}: ${input.notes}`, { size: 9 });
  }
}

export function drawPayslipSignature(ctx: PayslipRenderContext): void {
  ctx.writer.moveDown(30);
  ctx.writer.hr();
  ctx.writer.text(ctx.labels.signatureLine, { size: 9 });
}

export function drawPayslipFooter(ctx: PayslipRenderContext): void {
  ctx.writer.moveDown(16);
  ctx.writer.text(ctx.labels.footer, { size: 9 });
}
