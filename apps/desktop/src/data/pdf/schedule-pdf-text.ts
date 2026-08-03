import type { Color, PDFFont, PDFPage } from 'pdf-lib';
import { toRtlVisualText } from './rtl-text';

export type TextAlign = 'left' | 'right' | 'center';

export type DrawTextOptions = {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly font: PDFFont;
  readonly color: Color;
  readonly align?: TextAlign;
  readonly locale: 'fr' | 'ar';
};

/**
 * Shapes + bidi-reorders `value` for `ar` (the same pass `InvoicePdfWriter.text`
 * runs), then draws it anchored at `x` per `align`. `align` is a **physical**
 * page position (`'left'` / `'right'`), not a logical start/end — the grid's own
 * column layout (`dayColumnIndex`) already decides which physical edge is which
 * per locale, so this helper stays a dumb anchor rather than re-deciding
 * direction. Used everywhere the schedule PDF places text outside the linear
 * top-down flow `InvoicePdfWriter` assumes (day headers, the time axis, block
 * labels laid out on a 2-D grid).
 */
export function drawAlignedText(page: PDFPage, value: string, options: DrawTextOptions): void {
  const shaped = options.locale === 'ar' ? toRtlVisualText(value) : value;
  const width = options.font.widthOfTextAtSize(shaped, options.size);
  const align = options.align ?? 'left';
  const x = align === 'center' ? options.x - width / 2 : align === 'right' ? options.x - width : options.x;
  page.drawText(shaped, { x, y: options.y, size: options.size, font: options.font, color: options.color });
}
