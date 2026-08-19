import { rgb, type Color } from 'pdf-lib';
import {
  InvoicePdfWriter,
  PAGE_MARGIN,
  MUTED_GRAY,
  HAIRLINE_GRAY,
  type PdfTextOptions,
  type PdfTextAlign,
} from './invoice-pdf-writer';

const INK: Color = rgb(0.1, 0.1, 0.1);

/** Fraction of the content width the right-aligned totals block occupies (~56%). */
const TOTALS_BLOCK_RATIO = 0.56;

/** An outlined status pill's two colors (no fill) — used next to the invoice title. */
export type PdfOutlineColors = {
  border: Color;
  text: Color;
};

/** One cell of the invoice meta grid: a muted caption over its value. */
export type PdfMetaCell = {
  label: string;
  value: string;
};

/**
 * The {@link InvoicePdfWriter} cursor extended with the SOU-279 invoice's own
 * blocks: the outlined status pill, the three-cell meta grid, and the
 * right-aligned totals column. Kept separate from the base so the shared cursor
 * (also used by the payslip and receipt PDFs) stays small and generic.
 */
export class InvoiceLayoutWriter extends InvoicePdfWriter {
  /** An outlined (unfilled) status pill, at the start edge by default —
   *  the `Payée` / `Payée partiellement` / `Annulée` marker beside the title. */
  outlinedBadge(value: string, colors: PdfOutlineColors, options: { align?: PdfTextAlign } = {}): void {
    const size = 8;
    const shaped = this.prepare(value);
    const padX = 7;
    const padY = 3;
    const boxWidth = this.boldFont.widthOfTextAtSize(shaped, size) + padX * 2;
    const boxHeight = size + padY * 2;
    const boxX = this.xFor(boxWidth, options.align ?? 'start');
    this.page.drawRectangle({
      x: boxX,
      y: this.y - size * 0.25 - padY,
      width: boxWidth,
      height: boxHeight,
      borderColor: colors.border,
      borderWidth: 0.75,
    });
    this.page.drawText(shaped, { x: boxX + padX, y: this.y, size, font: this.boldFont, color: colors.text });
    this.y -= boxHeight + 6;
  }

  /** A row of equal-width caption/value cells spanning the content width —
   *  the meta grid (Numéro · Date d'émission · Date d'échéance). */
  metaGrid(cells: readonly PdfMetaCell[]): void {
    if (cells.length === 0) return;
    const labelSize = 8;
    const valueSize = 9;
    const labelY = this.y;
    const valueY = this.y - labelSize - 4;
    const columnWidth = this.contentWidth / cells.length;
    cells.forEach((cell, index) => {
      const x = PAGE_MARGIN + index * columnWidth;
      this.page.drawText(this.prepare(cell.label), {
        x,
        y: labelY,
        size: labelSize,
        font: this.regularFont,
        color: MUTED_GRAY,
      });
      this.page.drawText(this.prepare(cell.value), {
        x,
        y: valueY,
        size: valueSize,
        font: this.boldFont,
        color: INK,
      });
    });
    this.y = valueY - valueSize - 6;
  }

  /** A label/amount row confined to the trailing ~56% of the content width. */
  totalsRow(label: string, amount: string, options: PdfTextOptions = {}): void {
    const size = options.size ?? 10;
    const font = this.font(options.bold ?? false);
    const color = options.color ?? INK;
    this.page.drawText(this.prepare(label), { x: this.totalsBlockLeft, y: this.y, size, font, color });
    const shapedAmount = this.prepare(amount);
    const amountX = this.pageWidth - PAGE_MARGIN - font.widthOfTextAtSize(shapedAmount, size);
    this.page.drawText(shapedAmount, { x: amountX, y: this.y, size, font, color });
    this.y -= size + 6;
  }

  /** A hairline spanning only the totals block. The generous bottom gap keeps
   *  the following total's ascenders clear of the hairline. */
  totalsRule(): void {
    this.y -= 4;
    this.page.drawLine({
      start: { x: this.totalsBlockLeft, y: this.y },
      end: { x: this.pageWidth - PAGE_MARGIN, y: this.y },
      thickness: 0.5,
      color: HAIRLINE_GRAY,
    });
    this.y -= 14;
  }

  private get contentWidth(): number {
    return this.pageWidth - PAGE_MARGIN * 2;
  }

  private get totalsBlockLeft(): number {
    return this.pageWidth - PAGE_MARGIN - this.contentWidth * TOTALS_BLOCK_RATIO;
  }
}
