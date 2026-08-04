import { rgb, type PDFFont, type PDFPage, type Color } from 'pdf-lib';
import { toRtlVisualText } from './rtl-text';

export const PAGE_MARGIN = 50;
export const BRAND_TEAL: Color = rgb(0x0f / 255, 0x76 / 255, 0x6e / 255);
export const MUTED_GRAY: Color = rgb(0.42, 0.45, 0.47);
export const HAIRLINE_GRAY: Color = rgb(0.87, 0.89, 0.9);
const BLACK: Color = rgb(0.1, 0.1, 0.1);

export type PdfTextAlign = 'start' | 'end' | 'center';

export type PdfTextOptions = {
  size?: number;
  bold?: boolean;
  color?: Color;
  align?: PdfTextAlign;
};

/** One line of a vertical text block, as consumed by {@link InvoicePdfWriter.twoColumns}. */
export type PdfTextLine = { value: string } & PdfTextOptions;

export type PdfBadgeColors = {
  background: Color;
  text: Color;
};

export type InvoicePdfWriterOptions = {
  page: PDFPage;
  locale: 'fr' | 'ar';
  regularFont: PDFFont;
  boldFont: PDFFont;
};

/**
 * A locale-aware line/row cursor for the invoice PDF. Callers never branch on
 * locale themselves: for `ar`, every string is shaped + bidi-reordered
 * ({@link toRtlVisualText}) and anchored to the page's right edge; for `fr` it
 * is drawn as-is, anchored left. `pdf-lib`'s `drawText` only ever places glyphs
 * left-to-right at increasing x — this class is what makes that read correctly
 * as RTL on the page.
 */
export class InvoicePdfWriter {
  private readonly page: PDFPage;
  private readonly locale: 'fr' | 'ar';
  private readonly regularFont: PDFFont;
  private readonly boldFont: PDFFont;
  private readonly pageWidth: number;
  y: number;
  /** Horizontal gap kept clear of the start margin (e.g. to clear a header logo). */
  startInset = 0;

  constructor(options: InvoicePdfWriterOptions) {
    this.page = options.page;
    this.locale = options.locale;
    this.regularFont = options.regularFont;
    this.boldFont = options.boldFont;
    this.pageWidth = options.page.getWidth();
    this.y = options.page.getHeight() - PAGE_MARGIN;
  }

  private prepare(value: string): string {
    return this.locale === 'ar' ? toRtlVisualText(value) : value;
  }

  private font(bold: boolean): PDFFont {
    return bold ? this.boldFont : this.regularFont;
  }

  private xFor(width: number, align: PdfTextAlign): number {
    if (align === 'center') return (this.pageWidth - width) / 2;
    const startIsLeft = this.locale === 'fr';
    if (align === 'start') {
      return startIsLeft
        ? PAGE_MARGIN + this.startInset
        : this.pageWidth - PAGE_MARGIN - this.startInset - width;
    }
    return startIsLeft ? this.pageWidth - PAGE_MARGIN - width : PAGE_MARGIN;
  }

  /** Draws `value` at the paragraph's start edge by default (right for `ar`, left for `fr`). */
  text(value: string, options: PdfTextOptions = {}): void {
    const size = options.size ?? 10;
    const font = this.font(options.bold ?? false);
    const shaped = this.prepare(value);
    const width = font.widthOfTextAtSize(shaped, size);
    const x = this.xFor(width, options.align ?? 'start');
    this.page.drawText(shaped, { x, y: this.y, size, font, color: options.color ?? BLACK });
    this.y -= size + 6;
  }

  /** A two-column row: label at the start edge, amount at the end edge —
   *  mirrors for `ar` so the ledger still reads start-to-end. */
  row(label: string, amount: string, options: PdfTextOptions = {}): void {
    const size = options.size ?? 10;
    const font = this.font(options.bold ?? false);
    const color = options.color ?? BLACK;
    const shapedLabel = this.prepare(label);
    const shapedAmount = this.prepare(amount);
    const labelX = this.xFor(font.widthOfTextAtSize(shapedLabel, size), 'start');
    const amountX = this.xFor(font.widthOfTextAtSize(shapedAmount, size), 'end');
    this.page.drawText(shapedLabel, { x: labelX, y: this.y, size, font, color });
    this.page.drawText(shapedAmount, { x: amountX, y: this.y, size, font, color });
    this.y -= size + 6;
  }

  /** Two vertical text blocks side by side — one hugging the start edge, one the
   *  end edge (mirrored for `ar`). The cursor lands below the taller block. */
  twoColumns(startLines: readonly PdfTextLine[], endLines: readonly PdfTextLine[]): void {
    const topY = this.y;
    for (const line of startLines) this.text(line.value, line);
    const startBottom = this.y;
    this.y = topY;
    for (const line of endLines) this.text(line.value, { align: 'end', ...line });
    this.y = Math.min(this.y, startBottom);
  }

  /** A soft pill behind a short status word, drawn at the end edge by default. */
  badge(value: string, colors: PdfBadgeColors, options: { align?: PdfTextAlign } = {}): void {
    const size = 8;
    const font = this.boldFont;
    const shaped = this.prepare(value);
    const padX = 7;
    const padY = 3;
    const boxWidth = font.widthOfTextAtSize(shaped, size) + padX * 2;
    const boxHeight = size + padY * 2;
    const boxX = this.xFor(boxWidth, options.align ?? 'end');
    this.page.drawRectangle({
      x: boxX,
      y: this.y - size * 0.25 - padY,
      width: boxWidth,
      height: boxHeight,
      color: colors.background,
    });
    this.page.drawText(shaped, { x: boxX + padX, y: this.y, size, font, color: colors.text });
    this.y -= boxHeight + 6;
  }

  /** A light divider, e.g. under a table's column headers. */
  rule(): void {
    this.drawLine(0.5, HAIRLINE_GRAY, 2, 8);
  }

  hr(): void {
    this.drawLine(0.75, MUTED_GRAY, 4, 12);
  }

  moveDown(amount: number): void {
    this.y -= amount;
  }

  private drawLine(thickness: number, color: Color, gapBefore: number, gapAfter: number): void {
    this.y -= gapBefore;
    this.page.drawLine({
      start: { x: PAGE_MARGIN, y: this.y },
      end: { x: this.pageWidth - PAGE_MARGIN, y: this.y },
      thickness,
      color,
    });
    this.y -= gapAfter;
  }
}
