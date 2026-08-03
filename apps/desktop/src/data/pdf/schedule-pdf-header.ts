import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { BRAND_TEAL } from './invoice-pdf-writer';
import { GRID_MARGIN } from './schedule-pdf-geometry';
import { drawAlignedText } from './schedule-pdf-text';
import { scheduleViewTitle } from './schedule-pdf-view-title';
import type { SchedulePdfLabels } from './schedule-pdf-labels';
import type { ScheduleExportPdfInput } from './schedule-pdf-input';

const LOGO_BOX = 42;

export type ScheduleHeaderFonts = {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
};

/** The center name (+ optional logo) and the document/scope title — mirrors the
 *  invoice/payslip header, anchored to the page's start edge (left for `fr`,
 *  right for `ar`), the opposite corner reserved for the logo. */
export async function drawScheduleHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  input: ScheduleExportPdfInput,
  labels: SchedulePdfLabels,
  fonts: ScheduleHeaderFonts,
): Promise<void> {
  const { locale } = input;
  const startX = locale === 'ar' ? page.getWidth() - GRID_MARGIN : GRID_MARGIN;
  const align = locale === 'ar' ? 'right' : 'left';
  let y = page.getHeight() - GRID_MARGIN;

  drawAlignedText(page, input.center.name, { x: startX, y, size: 14, font: fonts.bold, color: BRAND_TEAL, align, locale });
  y -= 18;
  drawAlignedText(page, labels.documentTitle, { x: startX, y, size: 11, font: fonts.bold, color: BRAND_TEAL, align, locale });
  y -= 14;
  drawAlignedText(page, scheduleViewTitle(input.view, labels, locale), {
    x: startX,
    y,
    size: 9,
    font: fonts.regular,
    color: BRAND_TEAL,
    align,
    locale,
  });

  if (input.center.logoBytes) await drawLogo(pdfDoc, page, input.center.logoBytes, locale);
}

/** Best-effort: an unreadable or unsupported logo format never blocks the PDF,
 *  mirroring the invoice/payslip renderers' own logo handling. */
async function drawLogo(
  pdfDoc: PDFDocument,
  page: PDFPage,
  bytes: Uint8Array,
  locale: 'fr' | 'ar',
): Promise<void> {
  try {
    const image = await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
    const { width, height } = image.scaleToFit(LOGO_BOX, LOGO_BOX);
    page.drawImage(image, {
      x: locale === 'ar' ? GRID_MARGIN : page.getWidth() - GRID_MARGIN - width,
      y: page.getHeight() - GRID_MARGIN - height,
      width,
      height,
    });
  } catch {
    // Corrupt bytes / unsupported format — the schedule still prints without a logo.
  }
}
