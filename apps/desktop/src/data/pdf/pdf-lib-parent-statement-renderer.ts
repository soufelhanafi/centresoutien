import { PDFDocument, StandardFonts, PageSizes, type PDFPage, type PDFFont } from 'pdf-lib';
import type { ParentStatementPdfRenderer, ParentStatementPdfInput } from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { PAGE_MARGIN } from './invoice-pdf-writer';
import { InvoiceLayoutWriter } from './invoice-layout-writer';
import { parentStatementPdfLabels } from './parent-statement-pdf-labels';
import {
  drawStatementHeader,
  drawStatementParties,
  drawChildBlock,
  drawGrandTotal,
  drawStatementFooter,
  type ParentStatementPdfContext,
} from './parent-statement-pdf-sections';

const LOGO_BOX = 48;
const LOGO_GAP = 10;

/**
 * `pdf-lib`-based {@link ParentStatementPdfRenderer} — the flat typographic A4
 * "Facture groupée" (SOU-284): header `Facture` + responsible guardian, one block
 * per child, then one grand-total block. Reuses the SOU-279 invoice primitives
 * ({@link InvoiceLayoutWriter} + `drawLineSection` + `formatMad` + the outline
 * status palette) rather than duplicating them; the per-student
 * `InvoicePdfRenderer` is left untouched.
 *
 * Renders **French only** (Arabic dropped from the money documents, SOU-271): the
 * layout draws with pdf-lib's built-in Helvetica and ignores `input.locale`.
 * Content depends only on `input` — the sole run-to-run variance is pdf-lib's own
 * save-time `CreationDate` metadata.
 */
export class PdfLibParentStatementRenderer implements ParentStatementPdfRenderer {
  async render(input: ParentStatementPdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const page = pdfDoc.addPage(PageSizes.A4);
    const [regularFont, boldFont] = await this.embedFonts(pdfDoc);
    const writer = new InvoiceLayoutWriter({ page, locale: 'fr', regularFont, boldFont });

    const logoBottomY = input.center.logoBytes
      ? await this.drawLogo(pdfDoc, page, input.center.logoBytes)
      : null;
    this.drawStatement({ writer, labels: parentStatementPdfLabels }, input, logoBottomY);

    return pdfDoc.save({ useObjectStreams: false });
  }

  private embedFonts(pdfDoc: PDFDocument): Promise<[PDFFont, PDFFont]> {
    return Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
    ]);
  }

  private drawStatement(
    ctx: ParentStatementPdfContext,
    input: ParentStatementPdfInput,
    logoBottomY: number | null,
  ): void {
    drawStatementHeader(ctx, input);
    if (logoBottomY !== null) ctx.writer.y = Math.min(ctx.writer.y, logoBottomY - LOGO_GAP);
    drawStatementParties(ctx, input);
    for (const child of input.children) drawChildBlock(ctx, child);
    drawGrandTotal(ctx, input);
    drawStatementFooter(ctx);
  }

  /** Best-effort brandmark on the header's end edge; an unreadable/unsupported
   *  logo never blocks the PDF. Returns the drawn logo's bottom `y`, or `null`. */
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
