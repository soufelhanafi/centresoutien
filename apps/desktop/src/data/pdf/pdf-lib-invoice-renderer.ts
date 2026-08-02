import { PDFDocument, StandardFonts, PageSizes, type PDFFont, type PDFPage } from 'pdf-lib';
import type { InvoicePdfRenderer, InvoicePdfInput } from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { InvoicePdfWriter, PAGE_MARGIN, BRAND_TEAL, MUTED_GRAY } from './invoice-pdf-writer';
import { invoicePdfLabels } from './invoice-pdf-labels';
import { amiriBoldBytes, amiriRegularBytes } from './pdf-fonts';
import { drawInvoiceMeta, drawLineSection, drawTotals, drawFooter } from './invoice-pdf-sections';
import type { PdfRenderContext } from './invoice-pdf-context';

const LOGO_BOX = 50;

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

    await this.drawHeader(pdfDoc, page, ctx, input);
    drawInvoiceMeta(ctx, input);
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

  private async drawHeader(
    pdfDoc: PDFDocument,
    page: PDFPage,
    ctx: PdfRenderContext,
    input: InvoicePdfInput,
  ): Promise<void> {
    if (input.center.logoBytes) await this.drawLogo(pdfDoc, page, input.center.logoBytes, input.locale);
    ctx.writer.text(input.center.name, { size: 16, bold: true, color: BRAND_TEAL });
    ctx.writer.text(input.center.address, { size: 9, color: MUTED_GRAY });
    // Known cosmetic quirk on the `ar` locale: Amiri's default OpenType
    // features insert a small extra gap around a bare "." immediately
    // followed by a Latin letter (e.g. "….ma") — harmless, the email still
    // reads correctly, and not worth widening this adapter's font-per-run
    // complexity to chase for one secondary contact line.
    ctx.writer.text(`${input.center.phone} · ${input.center.email}`, { size: 9, color: MUTED_GRAY });
    ctx.writer.moveDown(6);
    ctx.writer.hr();
  }

  /** Best-effort: an unreadable or unsupported logo format never blocks the PDF.
   *  Anchored to the header text's trailing edge — the start (left) in French,
   *  the end (right) in Arabic — so it never overlaps the right-anchored AR header. */
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
      // Corrupt bytes / unsupported format — the invoice still prints without a logo.
    }
  }
}
