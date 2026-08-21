import { PDFDocument, StandardFonts, PageSizes, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type {
  TeacherRosterPdfRenderer,
  TeacherRosterPdfInput,
  TeacherRosterPdfRow,
} from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { PAGE_MARGIN, BRAND_TEAL, MUTED_GRAY, HAIRLINE_GRAY } from './invoice-pdf-writer';
import { teacherRosterPdfLabels, TEACHER_ROSTER_COLUMN_WEIGHTS } from './teacher-roster-pdf-labels';

const INK = rgb(0.1, 0.1, 0.1);
const LOGO_BOX = 44;
const ROW_HEIGHT = 16;
const HEADER_SIZE = 8;
const CELL_SIZE = 9;
const CELL_PAD = 4;
const PAGE_NUMBER_OFFSET = 18;
const PAGE_NUMBER_SIZE = 8;

type Column = { readonly key: keyof TeacherRosterPdfRow; readonly label: string; readonly x: number; readonly width: number };

/** Trim `value` with a trailing ellipsis until it fits `maxWidth` at `size`
 *  (SOU-288 intent: over-long cell text never bleeds into the next column). */
function truncateToWidth(value: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let text = value;
  while (text.length > 1 && font.widthOfTextAtSize(`${text}…`, size) > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

// `pdf-lib`-based TeacherRosterPdfRenderer — the flat A4 "Liste des élèves"
// (SOU-299): a center-branded header with the teacher name, generation date and
// active-filter summary, then a paginated table of the filtered roster. Renders
// French only (Arabic dropped from the documents, SOU-271) with pdf-lib's built-in
// Helvetica. Content depends only on `input`; the sole run-to-run variance is
// pdf-lib's own save-time `CreationDate` metadata.
export class PdfLibTeacherRosterRenderer implements TeacherRosterPdfRenderer {
  async render(input: TeacherRosterPdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const [regularFont, boldFont] = await this.embedFonts(pdfDoc);

    let page = pdfDoc.addPage(PageSizes.A4);
    const contentWidth = page.getWidth() - PAGE_MARGIN * 2;
    const columns = this.layoutColumns(contentWidth);

    let y = await this.drawHeader(pdfDoc, page, boldFont, regularFont, input);

    if (input.rows.length === 0) {
      page.drawText(teacherRosterPdfLabels.empty, {
        x: PAGE_MARGIN,
        y: y - 6,
        size: CELL_SIZE,
        font: regularFont,
        color: MUTED_GRAY,
      });
    } else {
      y = this.drawColumnHeader(page, boldFont, columns, y);
      for (const row of input.rows) {
        if (y - ROW_HEIGHT < PAGE_MARGIN + PAGE_NUMBER_OFFSET) {
          page = pdfDoc.addPage(PageSizes.A4);
          y = page.getHeight() - PAGE_MARGIN;
          y = this.drawColumnHeader(page, boldFont, columns, y);
        }
        this.drawRow(page, regularFont, columns, row, y);
        y -= ROW_HEIGHT;
      }
    }

    this.stampPageNumbers(pdfDoc, regularFont);
    return pdfDoc.save({ useObjectStreams: false });
  }

  private embedFonts(pdfDoc: PDFDocument): Promise<[PDFFont, PDFFont]> {
    return Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
    ]);
  }

  private layoutColumns(contentWidth: number): readonly Column[] {
    const labels = teacherRosterPdfLabels.columns;
    let x = PAGE_MARGIN;
    const columns: Column[] = [];
    for (const [key, weight] of Object.entries(TEACHER_ROSTER_COLUMN_WEIGHTS)) {
      const width = contentWidth * weight;
      columns.push({ key: key as keyof TeacherRosterPdfRow, label: labels[key as keyof typeof labels], x, width });
      x += width;
    }
    return columns;
  }

  private async drawHeader(
    pdfDoc: PDFDocument,
    page: PDFPage,
    boldFont: PDFFont,
    regularFont: PDFFont,
    input: TeacherRosterPdfInput,
  ): Promise<number> {
    let y = page.getHeight() - PAGE_MARGIN;
    if (input.center.logoBytes) await this.drawLogo(pdfDoc, page, input.center.logoBytes);

    page.drawText(input.center.name, { x: PAGE_MARGIN, y, size: 13, font: boldFont, color: BRAND_TEAL });
    y -= 16;
    for (const line of [input.center.address, input.center.phone, input.center.email].filter(Boolean)) {
      page.drawText(line, { x: PAGE_MARGIN, y, size: 8, font: regularFont, color: MUTED_GRAY });
      y -= 11;
    }

    y -= 10;
    page.drawText(`${teacherRosterPdfLabels.title} — ${input.teacherName}`, {
      x: PAGE_MARGIN,
      y,
      size: 14,
      font: boldFont,
      color: INK,
    });
    y -= 15;
    const meta = `${teacherRosterPdfLabels.generatedOn(input.generatedOn)}   ·   ${teacherRosterPdfLabels.count(input.rows.length)}`;
    page.drawText(meta, { x: PAGE_MARGIN, y, size: 9, font: regularFont, color: MUTED_GRAY });
    y -= 13;
    for (const line of input.filterSummary) {
      page.drawText(line, { x: PAGE_MARGIN, y, size: 8, font: regularFont, color: MUTED_GRAY });
      y -= 11;
    }
    return y - 6;
  }

  private drawColumnHeader(page: PDFPage, boldFont: PDFFont, columns: readonly Column[], y: number): number {
    for (const column of columns) {
      page.drawText(column.label, { x: column.x, y, size: HEADER_SIZE, font: boldFont, color: MUTED_GRAY });
    }
    const ruleY = y - 5;
    page.drawLine({
      start: { x: PAGE_MARGIN, y: ruleY },
      end: { x: page.getWidth() - PAGE_MARGIN, y: ruleY },
      thickness: 0.75,
      color: HAIRLINE_GRAY,
    });
    return ruleY - ROW_HEIGHT + 4;
  }

  private drawRow(page: PDFPage, font: PDFFont, columns: readonly Column[], row: TeacherRosterPdfRow, y: number): void {
    for (const column of columns) {
      const raw = row[column.key];
      const text = truncateToWidth(raw, font, CELL_SIZE, column.width - CELL_PAD);
      page.drawText(text, { x: column.x, y, size: CELL_SIZE, font, color: INK });
    }
  }

  private stampPageNumbers(pdfDoc: PDFDocument, font: PDFFont): void {
    const pages = pdfDoc.getPages();
    pages.forEach((page, index) => {
      const label = teacherRosterPdfLabels.pageLabel(index + 1, pages.length);
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

  private async drawLogo(pdfDoc: PDFDocument, page: PDFPage, bytes: Uint8Array): Promise<void> {
    try {
      const image = await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
      const { width, height } = image.scaleToFit(LOGO_BOX, LOGO_BOX);
      page.drawImage(image, {
        x: page.getWidth() - PAGE_MARGIN - width,
        y: page.getHeight() - PAGE_MARGIN - height,
        width,
        height,
      });
    } catch {
      // A malformed logo never blocks the roster PDF.
    }
  }
}
