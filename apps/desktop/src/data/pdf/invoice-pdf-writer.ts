import { rgb, type PDFFont, type PDFPage, type Color } from 'pdf-lib';
import { toRtlVisualText } from './rtl-text';

export const PAGE_MARGIN = 50;
export const BRAND_TEAL: Color = rgb(0x0f / 255, 0x76 / 255, 0x6e / 255);
export const MUTED_GRAY: Color = rgb(0.42, 0.45, 0.47);
const BLACK: Color = rgb(0.1, 0.1, 0.1);

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

  /** Draws `value` at the paragraph's start edge (right for `ar`, left for `fr`). */
  text(value: string, options: { size?: number; bold?: boolean; color?: Color } = {}): void {
    const size = options.size ?? 10;
    const font = this.font(options.bold ?? false);
    const shaped = this.prepare(value);
    const width = font.widthOfTextAtSize(shaped, size);
    const x = this.locale === 'ar' ? this.pageWidth - PAGE_MARGIN - width : PAGE_MARGIN;
    this.page.drawText(shaped, { x, y: this.y, size, font, color: options.color ?? BLACK });
    this.y -= size + 6;
  }

  /** A two-column row: label at the start edge, amount at the end edge —
   *  mirrors for `ar` so the ledger still reads start-to-end. */
  row(label: string, amount: string, options: { size?: number; bold?: boolean } = {}): void {
    const size = options.size ?? 10;
    const font = this.font(options.bold ?? false);
    const shapedLabel = this.prepare(label);
    const shapedAmount = this.prepare(amount);
    const labelWidth = font.widthOfTextAtSize(shapedLabel, size);
    const amountWidth = font.widthOfTextAtSize(shapedAmount, size);
    const startX = this.locale === 'ar' ? this.pageWidth - PAGE_MARGIN - labelWidth : PAGE_MARGIN;
    const endX = this.locale === 'ar' ? PAGE_MARGIN : this.pageWidth - PAGE_MARGIN - amountWidth;
    this.page.drawText(shapedLabel, { x: startX, y: this.y, size, font, color: BLACK });
    this.page.drawText(shapedAmount, { x: endX, y: this.y, size, font, color: BLACK });
    this.y -= size + 6;
  }

  hr(): void {
    this.y -= 4;
    this.page.drawLine({
      start: { x: PAGE_MARGIN, y: this.y },
      end: { x: this.pageWidth - PAGE_MARGIN, y: this.y },
      thickness: 0.75,
      color: MUTED_GRAY,
    });
    this.y -= 12;
  }

  moveDown(amount: number): void {
    this.y -= amount;
  }
}
