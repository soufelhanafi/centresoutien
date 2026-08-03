import { PDFDocument, StandardFonts, PageSizes, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PaymentReceiptPdfRenderer, PaymentReceiptPdfInput } from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { InvoicePdfWriter, PAGE_MARGIN, BRAND_TEAL, MUTED_GRAY } from './invoice-pdf-writer';
import { paymentReceiptPdfLabels } from './payment-receipt-pdf-labels';
import { amiriBoldBytes, amiriRegularBytes } from './pdf-fonts';
import {
  drawPaymentReceiptMeta,
  drawPaymentReceiptDetails,
  drawPaymentReceiptFooter,
  type PaymentReceiptRenderContext,
} from './payment-receipt-pdf-sections';

const LOGO_BOX = 50;

/**
 * `pdf-lib`-based {@link PaymentReceiptPdfRenderer} (SOU-101) — reuses the
 * invoice PDF adapter's font/layout setup (`InvoicePdfWriter`, the bundled
 * Amiri font for `ar`, `pdf-lib`'s built-in Helvetica for `fr`) so all three
 * document families (invoice, payslip, receipt) read as one visual system.
 * Content depends only on `input`.
 */
export class PdfLibPaymentReceiptRenderer implements PaymentReceiptPdfRenderer {
  async render(input: PaymentReceiptPdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const page = pdfDoc.addPage(PageSizes.A4);
    const [regularFont, boldFont] = await this.embedFonts(pdfDoc, input.locale);

    const writer = new InvoicePdfWriter({ page, locale: input.locale, regularFont, boldFont });
    const ctx: PaymentReceiptRenderContext = {
      writer,
      labels: paymentReceiptPdfLabels(input.locale),
      locale: input.locale,
    };

    await this.drawHeader(pdfDoc, page, ctx, input);
    drawPaymentReceiptMeta(ctx, input);
    drawPaymentReceiptDetails(ctx, input);
    drawPaymentReceiptFooter(ctx);

    // Plain indirect objects, not compressed object streams — same trade as the
    // invoice/payslip renderers, kept for a document meant to be handed to a parent.
    return pdfDoc.save({ useObjectStreams: false });
  }

  private async embedFonts(
    pdfDoc: PDFDocument,
    locale: 'fr' | 'ar',
  ): Promise<readonly [PDFFont, PDFFont]> {
    if (locale === 'ar') {
      const regular = await pdfDoc.embedFont(amiriRegularBytes(), { subset: false });
      const bold = await pdfDoc.embedFont(amiriBoldBytes(), { subset: false });
      return [regular, bold] as const;
    }
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    return [regular, bold] as const;
  }

  private async drawHeader(
    pdfDoc: PDFDocument,
    page: PDFPage,
    ctx: PaymentReceiptRenderContext,
    input: PaymentReceiptPdfInput,
  ): Promise<void> {
    if (input.center.logoBytes) await this.drawLogo(pdfDoc, page, input.center.logoBytes, input.locale);
    ctx.writer.text(input.center.name, { size: 16, bold: true, color: BRAND_TEAL });
    ctx.writer.text(input.center.address, { size: 9, color: MUTED_GRAY });
    ctx.writer.text(`${input.center.phone} · ${input.center.email}`, { size: 9, color: MUTED_GRAY });
    ctx.writer.moveDown(6);
    ctx.writer.hr();
  }

  /** Best-effort: an unreadable or unsupported logo format never blocks the PDF. */
  private async drawLogo(
    pdfDoc: PDFDocument,
    page: PDFPage,
    bytes: Uint8Array,
    locale: 'fr' | 'ar',
  ): Promise<void> {
    try {
      const image = await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
      const { width, height } = image.scaleToFit(LOGO_BOX, LOGO_BOX);
      page.drawImage(image, {
        x: locale === 'ar' ? PAGE_MARGIN : page.getWidth() - PAGE_MARGIN - width,
        y: page.getHeight() - PAGE_MARGIN - height,
        width,
        height,
      });
    } catch {
      // Corrupt bytes / unsupported format — the receipt still prints without a logo.
    }
  }
}
