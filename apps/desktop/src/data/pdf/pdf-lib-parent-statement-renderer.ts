import { PDFDocument, StandardFonts, PageSizes, type PDFPage, type PDFFont } from 'pdf-lib';
import type {
  ParentStatementPdfRenderer,
  ParentStatementPdfInput,
  ParentStatementPdfChild,
} from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { PAGE_MARGIN, MUTED_GRAY } from './invoice-pdf-writer';
import { InvoiceLayoutWriter } from './invoice-layout-writer';
import { parentStatementPdfLabels, type ParentStatementPdfLabels } from './parent-statement-pdf-labels';
import {
  drawStatementHeader,
  drawStatementParties,
  drawChildBlock,
  drawGrandTotal,
  drawLastPageThanks,
  type ParentStatementPdfContext,
} from './parent-statement-pdf-sections';

const LOGO_BOX = 48;
const LOGO_GAP = 10;

// A child block's height is driven by its line count, and an invoice carries no
// enforced maximum line count (the generate job emits one line per subscription,
// but legacy per-group billing can produce several — SOU-68/§7), so the reserve is
// derived from the child's actual lines rather than a fixed constant: a fixed
// reserve would let a rare many-line child overflow its block. The fixed part
// covers the name + invoice no. + status pill + child subtotal + inter-block gaps;
// each present kind-section adds its title + hairline rule + subtotal, plus one row
// per formula line. Residual: a single child taller than a whole content page
// (~30+ lines, unreached by any real invoice) would still need inner-line
// pagination — tracked with the per-student invoice pagination follow-up (SOU-285).
const CHILD_HEADER_RESERVE = 100;
const LINE_SECTION_RESERVE = 52;
const LINE_ROW_RESERVE = 16;

function kindSectionReserve(rowCount: number): number {
  return rowCount > 0 ? LINE_SECTION_RESERVE + rowCount * LINE_ROW_RESERVE : 0;
}

function childBlockReserve(child: ParentStatementPdfChild): number {
  return (
    CHILD_HEADER_RESERVE +
    kindSectionReserve(child.regularLines.length) +
    kindSectionReserve(child.examPrepLines.length)
  );
}

/** Points reserved before the grand-total block so its rule + up to three rows
 *  (the tallest, partial/paid, variant is ~91 pt) always land whole on one page,
 *  never split and never clipped off the bottom. */
const GRAND_TOTAL_RESERVE = 110;

/** Bottom-margin offset for the centered `Page i / N` stamp on every page. */
const PAGE_NUMBER_OFFSET = 18;
const PAGE_NUMBER_SIZE = 8;

function ensurePageSpace(pdfDoc: PDFDocument, writer: InvoiceLayoutWriter, needed: number): void {
  if (writer.hasRoomFor(needed)) return;
  writer.startPage(pdfDoc.addPage(PageSizes.A4));
}

// `pdf-lib`-based ParentStatementPdfRenderer — the flat typographic A4 "Facture
// groupée" (SOU-284): header `Facture` + responsible guardian, one block per child,
// then one grand-total block. Reuses the SOU-279 invoice primitives
// (InvoiceLayoutWriter + `drawLineSection` + `formatMad` + the outline status
// palette) rather than duplicating them; the per-student InvoicePdfRenderer is left
// untouched.
//
// Renders French only (Arabic dropped from the money documents, SOU-271): the
// layout draws with pdf-lib's built-in Helvetica and ignores `input.locale`.
// Content depends only on `input` — the sole run-to-run variance is pdf-lib's own
// save-time `CreationDate` metadata.
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
    this.drawStatement(pdfDoc, { writer, labels: parentStatementPdfLabels }, input, logoBottomY);
    this.stampPageNumbers(pdfDoc, regularFont, parentStatementPdfLabels);

    return pdfDoc.save({ useObjectStreams: false });
  }

  private embedFonts(pdfDoc: PDFDocument): Promise<[PDFFont, PDFFont]> {
    return Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
    ]);
  }

  private drawStatement(
    pdfDoc: PDFDocument,
    context: ParentStatementPdfContext,
    input: ParentStatementPdfInput,
    logoBottomY: number | null,
  ): void {
    drawStatementHeader(context, input);
    if (logoBottomY !== null) context.writer.y = Math.min(context.writer.y, logoBottomY - LOGO_GAP);
    drawStatementParties(context, input);
    for (const child of input.children) {
      ensurePageSpace(pdfDoc, context.writer, childBlockReserve(child));
      drawChildBlock(context, child);
    }
    ensurePageSpace(pdfDoc, context.writer, GRAND_TOTAL_RESERVE);
    drawGrandTotal(context, input);
    drawLastPageThanks(context);
  }

  // Stamps a centered `Page i / N` at the bottom margin of every page once the
  // final page count is known — the footer's page numbers reflect real totals.
  private stampPageNumbers(pdfDoc: PDFDocument, font: PDFFont, labels: ParentStatementPdfLabels): void {
    const pages = pdfDoc.getPages();
    pages.forEach((page, index) => {
      const label = labels.pageLabel(index + 1, pages.length);
      const width = font.widthOfTextAtSize(label, PAGE_NUMBER_SIZE);
      page.drawText(label, {
        x: (page.getWidth() - width) / 2,
        y: PAGE_MARGIN - PAGE_NUMBER_OFFSET,
        size: PAGE_NUMBER_SIZE,
        font,
        color: MUTED_GRAY,
      });
    });
  }

  // Best-effort brandmark on the header's end edge; an unreadable/unsupported logo
  // never blocks the PDF. Returns the drawn logo's bottom `y`, or `null`.
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
