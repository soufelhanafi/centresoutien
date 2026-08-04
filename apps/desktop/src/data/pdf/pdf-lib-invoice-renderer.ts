import { PDFDocument, StandardFonts, PageSizes, type PDFFont, type PDFPage } from 'pdf-lib';
import type { InvoicePdfRenderer, InvoicePdfInput } from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { InvoicePdfWriter, PAGE_MARGIN } from './invoice-pdf-writer';
import { invoicePdfLabels } from './invoice-pdf-labels';
import { amiriBoldBytes, amiriRegularBytes } from './pdf-fonts';
import { drawHeaderBlock, drawBillTo, drawLineSection, drawTotals, drawFooter } from './invoice-pdf-sections';
import type { PdfRenderContext } from './invoice-pdf-context';

const LOGO_BOX = 44;
const LOGO_TEXT_GAP = 14;

/**
 * `pdf-lib`-based {@link InvoicePdfRenderer} (SOU-69) — real embedded-font A4
 * layout, never `webContents.printToPDF` (KICKOFF). French draws with pdf-lib's
 * built-in Helvetica (full Latin-1 coverage, no embedding needed); Arabic
 * embeds the bundled Amiri font and routes every string through
 * {@link InvoicePdfWriter}, which shapes + bidi-reorders it. Content depends
 * only on `input` — the only thing that varies run-to-run is pdf-lib's own
 * save-time `CreationDate` metadata, not the rendered page.
 */
export class PdfLibInvoiceRenderer implements InvoicePdfRenderer {
  async render(input: InvoicePdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const page = pdfDoc.addPage(PageSizes.A4);
    const [regularFont, boldFont] = await this.embedFonts(pdfDoc, input.locale);

    const writer = new InvoicePdfWriter({ page, locale: input.locale, regularFont, boldFont });
    const ctx: PdfRenderContext = { writer, labels: invoicePdfLabels(input.locale), locale: input.locale };

    if (input.center.logoBytes && (await this.drawLogo(pdfDoc, page, input.center.logoBytes, input.locale))) {
      writer.startInset = LOGO_BOX + LOGO_TEXT_GAP;
    }
    drawHeaderBlock(ctx, input);
    writer.startInset = 0;
    drawBillTo(ctx, input);
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

    // `useObjectStreams: false`: pdf-lib's default bundles small dictionary
    // objects (incl. the font descriptor holding `/BaseFont`) into compressed
    // object streams, which barely changes file size here (the embedded font
    // binary dominates it either way) but makes the PDF's own internal
    // structure opaque to any tool doing a raw byte/text inspection — plain
    // indirect objects keep the file inspectable, a small trade worth making
    // for a document meant to be handed to a parent or printed at a center.
    return pdfDoc.save({ useObjectStreams: false });
  }

  private async embedFonts(
    pdfDoc: PDFDocument,
    locale: 'fr' | 'ar',
  ): Promise<readonly [PDFFont, PDFFont]> {
    if (locale === 'ar') {
      // `subset: true` silently drops most of Amiri's glyphs with this pdf-lib
      // + fontkit combination (verified: Latin text and shaped Arabic both come
      // out empty/garbled) — embed the full font instead. Costs ~1MB per PDF,
      // an acceptable trade for a correctly-rendered invoice.
      const regular = await pdfDoc.embedFont(amiriRegularBytes(), { subset: false });
      const bold = await pdfDoc.embedFont(amiriBoldBytes(), { subset: false });
      return [regular, bold] as const;
    }
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    return [regular, bold] as const;
  }

  /** Best-effort: an unreadable or unsupported logo format never blocks the PDF.
   *  Anchored to the header's start edge — left in French, right in Arabic —
   *  beside the center identity block; returns whether anything was drawn so the
   *  caller can indent the text clear of it. */
  private async drawLogo(
    pdfDoc: PDFDocument,
    page: PDFPage,
    bytes: Uint8Array,
    locale: 'fr' | 'ar',
  ): Promise<boolean> {
    try {
      const image = await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
      const { width, height } = image.scaleToFit(LOGO_BOX, LOGO_BOX);
      const x = locale === 'ar' ? page.getWidth() - PAGE_MARGIN - width : PAGE_MARGIN;
      page.drawImage(image, { x, y: page.getHeight() - PAGE_MARGIN - height, width, height });
      return true;
    } catch {
      // Corrupt bytes / unsupported format — the invoice still prints without a logo.
      return false;
    }
  }
}
