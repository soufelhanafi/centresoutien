import type { PDFFont, PDFPage } from 'pdf-lib';
import { WEEKDAYS } from '@centresoutien/domain';
import { MUTED_GRAY } from './invoice-pdf-writer';
import { dayColumnX, GRID_MARGIN, minutesToGridY, type ScheduleGridGeometry } from './schedule-pdf-geometry';
import { drawAlignedText } from './schedule-pdf-text';
import type { SchedulePdfLabels } from './schedule-pdf-labels';

const HOUR_MINUTES = 60;

/** The grid's outer border and the 7 vertical day-column separators. */
export function drawGridFrame(page: PDFPage, geometry: ScheduleGridGeometry): void {
  const { gridLeft, gridRight, gridTop, gridBottom, columnWidth } = geometry;
  page.drawRectangle({
    x: gridLeft,
    y: gridBottom,
    width: gridRight - gridLeft,
    height: gridTop - gridBottom,
    borderColor: MUTED_GRAY,
    borderWidth: 0.75,
  });
  for (let column = 1; column < WEEKDAYS.length; column += 1) {
    const x = gridLeft + column * columnWidth;
    page.drawLine({
      start: { x, y: gridBottom },
      end: { x, y: gridTop },
      thickness: 0.5,
      color: MUTED_GRAY,
      opacity: 0.6,
    });
  }
}

/** The 7 weekday headers, one centered per column, mirrored for `ar` via
 *  `dayColumnX`. */
export function drawDayHeaders(
  page: PDFPage,
  geometry: ScheduleGridGeometry,
  labels: SchedulePdfLabels,
  locale: 'fr' | 'ar',
  font: PDFFont,
): void {
  const y = geometry.gridTop + 6;
  for (const day of WEEKDAYS) {
    const x = dayColumnX(day, geometry, locale) + geometry.columnWidth / 2;
    drawAlignedText(page, labels.weekdays[day], { x, y, size: 10, font, color: MUTED_GRAY, align: 'center', locale });
  }
}

/** Hourly tick labels down the time axis, on the grid's physical left. */
export function drawTimeAxis(page: PDFPage, geometry: ScheduleGridGeometry, font: PDFFont): void {
  const { startMinutes, endMinutes } = geometry.timeBounds;
  const firstHour = Math.ceil(startMinutes / HOUR_MINUTES) * HOUR_MINUTES;
  const lastHour = Math.floor(endMinutes / HOUR_MINUTES) * HOUR_MINUTES;
  for (let minutes = firstHour; minutes <= lastHour; minutes += HOUR_MINUTES) {
    const y = minutesToGridY(minutes, geometry);
    const hourLabel = `${String(Math.floor(minutes / HOUR_MINUTES)).padStart(2, '0')}:00`;
    drawAlignedText(page, hourLabel, {
      x: geometry.gridLeft - 6,
      y: y - 3,
      size: 7,
      font,
      color: MUTED_GRAY,
      align: 'right',
      locale: 'fr',
    });
    page.drawLine({
      start: { x: geometry.gridLeft, y },
      end: { x: geometry.gridRight, y },
      thickness: 0.4,
      color: MUTED_GRAY,
      opacity: 0.35,
    });
  }
}

/** The document footer, anchored to the page's start edge like the header. */
export function drawScheduleFooter(
  page: PDFPage,
  labels: SchedulePdfLabels,
  locale: 'fr' | 'ar',
  font: PDFFont,
): void {
  const x = locale === 'ar' ? page.getWidth() - GRID_MARGIN : GRID_MARGIN;
  const align = locale === 'ar' ? 'right' : 'left';
  drawAlignedText(page, labels.footer, { x, y: GRID_MARGIN + 4, size: 7.5, font, color: MUTED_GRAY, align, locale });
}
