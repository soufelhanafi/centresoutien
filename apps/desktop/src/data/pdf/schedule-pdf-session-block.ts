import type { PDFFont, PDFPage } from 'pdf-lib';
import { dayColumnX, timeToGridY, type ScheduleGridGeometry } from './schedule-pdf-geometry';
import type { LanedSession } from './schedule-pdf-lane-layout';
import { drawAlignedText } from './schedule-pdf-text';
import {
  EXAM_PREP_BADGE_BACKGROUND,
  EXAM_PREP_BADGE_FOREGROUND,
  EXAM_PREP_BORDER_COLOR,
  subjectPaletteSlot,
} from './schedule-subject-palette';
import type { ScheduleExportSessionRow } from './schedule-pdf-input';
import type { SchedulePdfLabels } from './schedule-pdf-labels';

const BLOCK_GUTTER = 4;
const MIN_BLOCK_HEIGHT = 14;
const MIN_BLOCK_WIDTH = 4;
const BADGE_SIZE = 12;

export type ScheduleBlockFonts = {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
};

/**
 * One session as a colour-coded box on the grid — the print equivalent of
 * `session-block.tsx`. The subject drives the fill/border colour
 * (`subjectPaletteSlot`, hashed the same way the live grid derives its CSS
 * vars); an exam-prep session additionally gets the dashed purple border and a
 * small badge, so the printed page keeps the two tracks as visually separable
 * as the live grid does (CLAUDE.md §7). `session.lane`/`laneCount`
 * (`assignLanes`) split the day column into side-by-side sub-columns so two
 * sessions overlapping in time (different rooms, same hour) never draw on top
 * of each other; the lane order mirrors for `ar` like the day columns do.
 */
export function drawSessionBlock(
  page: PDFPage,
  session: LanedSession<ScheduleExportSessionRow>,
  geometry: ScheduleGridGeometry,
  fonts: ScheduleBlockFonts,
  labels: SchedulePdfLabels,
  locale: 'fr' | 'ar',
): void {
  const columnX = dayColumnX(session.dayOfWeek, geometry, locale);
  const laneWidth = geometry.columnWidth / session.laneCount;
  const laneIndex = locale === 'ar' ? session.laneCount - 1 - session.lane : session.lane;
  const x = columnX + laneIndex * laneWidth + BLOCK_GUTTER;
  const width = Math.max(MIN_BLOCK_WIDTH, laneWidth - BLOCK_GUTTER * 2);
  const yTop = timeToGridY(session.start, geometry);
  const yBottom = timeToGridY(session.end, geometry);
  const height = Math.max(MIN_BLOCK_HEIGHT, yTop - yBottom);
  const isExamPrep = session.kind === 'exam-prep';
  const slot = subjectPaletteSlot(session.subjectId);

  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color: slot.background,
    borderColor: isExamPrep ? EXAM_PREP_BORDER_COLOR : slot.border,
    borderWidth: isExamPrep ? 1.25 : 0.75,
    ...(isExamPrep ? { borderDashArray: [3, 2] } : {}),
  });

  if (isExamPrep) drawExamPrepBadge(page, x, yTop, width, labels, locale, fonts.bold);

  const textX = locale === 'ar' ? x + width - 3 : x + 3;
  const align = locale === 'ar' ? 'right' : 'left';
  const subject = session.subjectName ? session.subjectName[locale] : labels.unknownSubject;
  drawAlignedText(page, subject, { x: textX, y: yTop - 9, size: 7, font: fonts.bold, color: slot.foreground, align, locale });
  drawAlignedText(page, `${session.start} – ${session.end}`, {
    x: textX,
    y: yTop - 18,
    size: 6.5,
    font: fonts.regular,
    color: slot.foreground,
    align,
    locale,
  });

  const meta = [session.teacherName?.[locale], session.roomName].filter((value): value is string => Boolean(value));
  if (meta.length > 0 && height > 26) {
    drawAlignedText(page, meta.join(' · '), {
      x: textX,
      y: yTop - 27,
      size: 6.5,
      font: fonts.regular,
      color: slot.foreground,
      align,
      locale,
    });
  }
}

function drawExamPrepBadge(
  page: PDFPage,
  blockX: number,
  blockYTop: number,
  blockWidth: number,
  labels: SchedulePdfLabels,
  locale: 'fr' | 'ar',
  font: PDFFont,
): void {
  const x = locale === 'ar' ? blockX + 2 : blockX + blockWidth - BADGE_SIZE - 2;
  const y = blockYTop - BADGE_SIZE - 1;
  page.drawRectangle({
    x,
    y,
    width: BADGE_SIZE,
    height: BADGE_SIZE - 4,
    color: EXAM_PREP_BADGE_BACKGROUND,
    borderColor: EXAM_PREP_BORDER_COLOR,
    borderWidth: 0.5,
    borderDashArray: [2, 1],
  });
  drawAlignedText(page, labels.examPrepBadge, {
    x: x + BADGE_SIZE / 2,
    y: y + 2,
    size: 5.5,
    font,
    color: EXAM_PREP_BADGE_FOREGROUND,
    align: 'center',
    locale,
  });
}
