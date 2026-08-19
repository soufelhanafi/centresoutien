import { PDFDocument, StandardFonts, PageSizes, type PDFPage } from 'pdf-lib';
import type { InvoicePdfRenderer, InvoicePdfInput } from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { PAGE_MARGIN } from './invoice-pdf-writer';
import { InvoiceLayoutWriter } from './invoice-layout-writer';
import { invoicePdfLabels } from './invoice-pdf-labels';
import {
  drawHeaderBlock,
  drawMetaGrid,
  drawParties,
  drawAmountBanner,
  drawLineSection,
  drawTotals,
  drawFooter,
} from './invoice-pdf-sections';
import type { PdfRenderContext } from './invoice-pdf-context';

const LOGO_BOX = 48;
const LOGO_GAP = 10;

/**
 * `pdf-lib`-based {@link InvoicePdfRenderer} — a flat typographic A4 invoice
 * (SOU-279), never `webContents.printToPDF`. Renders **French only**: Arabic was
 * dropped from the invoice (SOU-271), so the layout draws with pdf-lib's built-in
 * Helvetica (full Latin-1 coverage, no font embedding) and ignores `input.locale`.
 * Content depends only on `input` — the only thing that varies run-to-run is
 * pdf-lib's own save-time `CreationDate` metadata, not the rendered page.
 */
export class PdfLibInvoiceRenderer implements InvoicePdfRenderer {
  async render(input: InvoicePdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const page = pdfDoc.addPage(PageSizes.A4);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const writer = new InvoiceLayoutWriter({ page, locale: 'fr', regularFont, boldFont });
    const ctx: PdfRenderContext = { writer, labels: invoicePdfLabels };

    const logoBottomY = input.center.logoBytes
      ? await this.drawLogo(pdfDoc, page, input.center.logoBytes)
      : null;

    drawHeaderBlock(ctx, input);
    if (logoBottomY !== null) writer.y = Math.min(writer.y, logoBottomY - LOGO_GAP);
    drawMetaGrid(ctx, input);
    drawParties(ctx, input);
    drawAmountBanner(ctx, input);
    drawLineSection(ctx, {
      title: ctx.labels.regularSection,
      lines: input.regularLines,
      subtotalMad: input.regularSubtotalMad,
    });
    drawLineSection(ctx, {
      title: ctx.labels.examPrepSection,
      lines: input.examPrepLines,
      subtotalMad: input.examPrepSubtotalMad,
    });
    drawTotals(ctx, input);
    drawFooter(ctx);

    // `useObjectStreams: false` keeps the PDF's internal structure inspectable by
    // plain byte/text tools — a small trade worth making for a document handed to
    // a parent or printed at a center.
    return pdfDoc.save({ useObjectStreams: false });
  }

  /** Best-effort brandmark on the header's end edge (top-right); an unreadable or
   *  unsupported logo never blocks the PDF. Returns the drawn logo's bottom `y`
   *  so the caller can keep the meta grid clear of it, or `null` when nothing was
   *  drawn. */
  private async drawLogo(pdfDoc: PDFDocument, page: PDFPage, bytes: Uint8Array): Promise<number | null> {
    try {
      const image = await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
      const { width, height } = image.scaleToFit(LOGO_BOX, LOGO_BOX);
      const x = page.getWidth() - PAGE_MARGIN - width;
      const y = page.getHeight() - PAGE_MARGIN - height;
      page.drawImage(image, { x, y, width, height });
      return y;
    } catch {
      return null;
    }
  }
}
