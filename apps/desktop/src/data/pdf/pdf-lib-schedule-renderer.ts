import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { WEEKDAYS, type WeekdayIndex } from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { amiriBoldBytes, amiriRegularBytes } from './pdf-fonts';
import { computeGridGeometry } from './schedule-pdf-geometry';
import { drawDayHeaders, drawGridFrame, drawScheduleFooter, drawTimeAxis } from './schedule-pdf-grid-drawing';
import { drawScheduleHeader } from './schedule-pdf-header';
import { schedulePdfLabels } from './schedule-pdf-labels';
import { assignLanes } from './schedule-pdf-lane-layout';
import { drawSessionBlock } from './schedule-pdf-session-block';
import type { ScheduleExportPdfInput, ScheduleExportSessionRow } from './schedule-pdf-input';

/** A4 landscape in `pdf-lib` points — `PageSizes.A4` is portrait, so this is it
 *  with width/height swapped, matching every "print the weekly grid" reference
 *  in SOU-107's acceptance criteria. */
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

/**
 * `pdf-lib`-based weekly-schedule renderer (SOU-107) — reuses the invoice/
 * payslip PDF adapters' font-loading approach (bundled Amiri for `ar`,
 * `pdf-lib`'s built-in Helvetica for `fr`) and `rtl-text.ts`'s shape+reorder
 * pass via `schedule-pdf-text.ts`'s `drawAlignedText`, but lays out a 2-D
 * time/day grid instead of the invoice's linear top-down flow, so it does not
 * reuse `InvoicePdfWriter` itself. Content depends only on `input`: the caller
 * (the IPC assembly step) has already resolved `ListWeekSessions`' rows down to
 * the requested view (full / room / teacher / group).
 */
export class PdfLibScheduleRenderer {
  async render(input: ScheduleExportPdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const page = pdfDoc.addPage(A4_LANDSCAPE);
    const [regularFont, boldFont] = await this.embedFonts(pdfDoc, input.locale);
    const labels = schedulePdfLabels(input.locale);

    await drawScheduleHeader(pdfDoc, page, input, labels, { regular: regularFont, bold: boldFont });

    const geometry = computeGridGeometry(page.getWidth(), page.getHeight(), input.sessions);
    drawGridFrame(page, geometry);
    drawDayHeaders(page, geometry, labels, input.locale, regularFont);
    drawTimeAxis(page, geometry, regularFont);

    for (const day of WEEKDAYS) {
      const laned = assignLanes(sessionsOnDay(input.sessions, day));
      for (const session of laned) {
        drawSessionBlock(page, session, geometry, { regular: regularFont, bold: boldFont }, labels, input.locale);
      }
    }

    drawScheduleFooter(page, labels, input.locale, regularFont);

    // Plain indirect objects, not compressed object streams — same trade as the
    // invoice/payslip renderers, kept for a document meant to be printed and
    // posted on a staffroom wall.
    return pdfDoc.save({ useObjectStreams: false });
  }

  private async embedFonts(
    pdfDoc: PDFDocument,
    locale: 'fr' | 'ar',
  ): Promise<readonly [PDFFont, PDFFont]> {
    if (locale === 'ar') {
      const regular = await pdfDoc.embedFont(amiriRegularBytes(), { subset: false });
      const bold = await pdfDoc.embedFont(amiriBoldBytes(), { subset: false });
      return [regular, bold] as const;
    }
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    return [regular, bold] as const;
  }
}

function sessionsOnDay(
  sessions: readonly ScheduleExportSessionRow[],
  day: WeekdayIndex,
): readonly ScheduleExportSessionRow[] {
  return sessions.filter((session) => session.dayOfWeek === day);
}
