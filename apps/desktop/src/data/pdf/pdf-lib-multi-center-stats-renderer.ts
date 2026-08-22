import { PDFDocument, StandardFonts, PageSizes, type PDFFont } from 'pdf-lib';
import type {
  MultiCenterStatsPdfRenderer,
  MultiCenterStatsPdfInput,
  MultiCenterStatsPdfRow,
} from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { InvoicePdfWriter, BRAND_TEAL, MUTED_GRAY } from './invoice-pdf-writer';
import { amiriBoldBytes, amiriRegularBytes } from './pdf-fonts';
import { formatMad } from './format-mad';
import { formatPercent } from './format-percent';
import { multiCenterStatsPdfLabels, type MultiCenterStatsPdfLabels } from './multi-center-stats-pdf-labels';

/** Height of a full center block: title (18) + 5 rows (5×16) + rule (16). */
const CENTER_BLOCK_HEIGHT = 18 + 5 * 16 + 16;
/** Height of an unavailable center block: title (18) + notice (15) + rule (16). */
const UNAVAILABLE_BLOCK_HEIGHT = 18 + 15 + 16;

/**
 * `pdf-lib`-based {@link MultiCenterStatsPdfRenderer} (SOU-106) — the per-center
 * stats owner report. Reuses the invoice/payslip PDF adapter's font + layout
 * primitives ({@link InvoicePdfWriter}, bundled Amiri for `ar`, Helvetica for
 * `fr`) so it reads as one visual system with the rest of the app's documents.
 * Content depends only on `input`.
 */
export class PdfLibMultiCenterStatsRenderer implements MultiCenterStatsPdfRenderer {
  async render(input: MultiCenterStatsPdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const page = pdfDoc.addPage(PageSizes.A4);
    const [regularFont, boldFont] = await this.embedFonts(pdfDoc, input.locale);

    const writer = new InvoicePdfWriter({ page, locale: input.locale, regularFont, boldFont });
    const labels = multiCenterStatsPdfLabels(input.locale);

    this.drawHeader(writer, labels, input);
    this.drawTotals(writer, labels, input);
    for (const row of input.rows) {
      const blockHeight = row.unavailable ? UNAVAILABLE_BLOCK_HEIGHT : CENTER_BLOCK_HEIGHT;
      if (!writer.hasRoomFor(blockHeight)) writer.startPage(pdfDoc.addPage(PageSizes.A4));
      this.drawCenter(writer, labels, input.locale, row);
    }

    return pdfDoc.save({ useObjectStreams: false });
  }

  private drawHeader(
    writer: InvoicePdfWriter,
    labels: MultiCenterStatsPdfLabels,
    input: MultiCenterStatsPdfInput,
  ): void {
    writer.text(labels.title, { size: 16, bold: true, color: BRAND_TEAL });
    writer.text(`${labels.month} : ${input.month}`, { size: 10, color: MUTED_GRAY });
    writer.text(
      labels.centersSummary(input.totals.availableCenterCount, input.totals.centerCount),
      { size: 9, color: MUTED_GRAY },
    );
    writer.hr();
  }

  private drawTotals(
    writer: InvoicePdfWriter,
    labels: MultiCenterStatsPdfLabels,
    input: MultiCenterStatsPdfInput,
  ): void {
    const locale = input.locale;
    const totals = input.totals;
    writer.row(labels.totalRevenue, formatMad(totals.revenueMad, locale), { bold: true });
    writer.row(labels.totalCollected, formatMad(totals.collectedMad, locale), { bold: true });
    writer.row(labels.totalStudents, String(totals.studentCount), { bold: true });
    writer.row(labels.totalUnpaidRate, this.rate(totals.unpaidRate, locale, labels), { bold: true });
    writer.hr();
  }

  private drawCenter(
    writer: InvoicePdfWriter,
    labels: MultiCenterStatsPdfLabels,
    locale: 'fr' | 'ar',
    row: MultiCenterStatsPdfRow,
  ): void {
    writer.text(`${row.displayName} · ${row.centerCode}`, { size: 12, bold: true });
    if (row.unavailable) {
      writer.text(labels.unavailable, { size: 9, color: MUTED_GRAY });
      writer.rule();
      return;
    }
    writer.row(labels.revenue, formatMad(row.revenueMad, locale));
    writer.row(labels.collected, formatMad(row.collectedMad, locale));
    writer.row(labels.students, String(row.studentCount));
    writer.row(labels.unpaidRate, this.rate(row.unpaidRate, locale, labels));
    writer.row(labels.momGrowth, this.growth(row.momGrowthPercent, locale, labels));
    writer.rule();
  }

  private rate(ratio: number | null, locale: 'fr' | 'ar', labels: MultiCenterStatsPdfLabels): string {
    return ratio === null ? labels.notApplicable : formatPercent(ratio * 100, locale);
  }

  private growth(percent: number | null, locale: 'fr' | 'ar', labels: MultiCenterStatsPdfLabels): string {
    return percent === null ? labels.notApplicable : formatPercent(percent, locale);
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
