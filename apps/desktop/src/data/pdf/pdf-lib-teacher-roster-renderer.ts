import { PDFDocument, StandardFonts, PageSizes, rgb, type PDFPage, type PDFFont, type Color } from 'pdf-lib';
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

// The Unicode code points beyond Latin-1 that WinAnsi (CP1252) can still encode —
// the punctuation/symbols pdf-lib's built-in Helvetica maps in the 0x80–0x9F slots.
const WIN_ANSI_EXTRA = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
    0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
    0x0153, 0x017e, 0x0178,
  ],
);

function isWinAnsiEncodable(codePoint: number): boolean {
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    WIN_ANSI_EXTRA.has(codePoint)
  );
}

/** Replace any character the built-in Helvetica (WinAnsi) cannot encode with `?`,
 *  so a name in an unsupported script (e.g. Arabic text in a `name.fr` field) can
 *  never make `pdf-lib` throw during measurement/drawing and abort the export. */
function winAnsiSafe(value: string): string {
  let out = '';
  for (const char of value) {
    out += isWinAnsiEncodable(char.codePointAt(0) ?? 0) ? char : '?';
  }
  return out;
}

/** Sanitize to WinAnsi, then trim with a trailing ellipsis until it fits `maxWidth`
 *  at `size` (SOU-288 intent: over-long text never bleeds past its column/margin). */
function truncateToWidth(value: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = winAnsiSafe(value);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let text = safe;
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
    const maxWidth = page.getWidth() - PAGE_MARGIN * 2;
    // Every header line is sanitized + fitted to the content width so a long center
    // name, teacher name, or filter value never runs off the page edge.
    const draw = (value: string, size: number, font: PDFFont, color: Color = INK): void => {
      page.drawText(truncateToWidth(value, font, size, maxWidth), { x: PAGE_MARGIN, y, size, font, color });
    };

    if (input.center.logoBytes) await this.drawLogo(pdfDoc, page, input.center.logoBytes);

    draw(input.center.name, 13, boldFont, BRAND_TEAL);
    y -= 16;
    for (const line of [input.center.address, input.center.phone, input.center.email].filter(Boolean)) {
      draw(line, 8, regularFont, MUTED_GRAY);
      y -= 11;
    }

    y -= 10;
    draw(`${teacherRosterPdfLabels.title} — ${input.teacherName}`, 14, boldFont, INK);
    y -= 15;
    draw(
      `${teacherRosterPdfLabels.generatedOn(input.generatedOn)}   ·   ${teacherRosterPdfLabels.count(input.rows.length)}`,
      9,
      regularFont,
      MUTED_GRAY,
    );
    y -= 13;
    for (const line of input.filterSummary) {
      draw(line, 8, regularFont, MUTED_GRAY);
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
