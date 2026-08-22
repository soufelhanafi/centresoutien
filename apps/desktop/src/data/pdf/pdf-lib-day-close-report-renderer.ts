import { PDFDocument, StandardFonts, PageSizes, type PDFPage, type PDFFont } from 'pdf-lib';
import type {
  DayCloseReportPdfRenderer,
  DayCloseReportPdfInput,
  DayCloseReport,
} from '@centresoutien/domain';
import { patchedFontkit } from './patched-fontkit';
import { InvoicePdfWriter, PAGE_MARGIN, BRAND_TEAL, MUTED_GRAY } from './invoice-pdf-writer';
import { formatMad } from './format-mad';
import { formatDateLabel } from './format-date';

const CURRENCY = 'MAD';
const LOGO_BOX = 48;
const LOGO_GAP = 10;
const ENCAISSEMENT_ROW_HEIGHT = 16;

const LABELS = {
  title: 'Clôture du jour',
  generatedAt: 'Généré le',
  newSubscriptions: 'Nouvelles inscriptions',
  regular: 'Régulier',
  examPrep: 'Préparation examen',
  studentsEnrolled: 'Inscriptions aux groupes',
  invoicesGenerated: 'Factures générées',
  totalBilled: 'Total facturé',
  totalCollected: 'Total encaissé',
  methodCash: 'Espèces',
  methodTransfer: 'Virement',
  methodCheque: 'Chèque',
  methodOther: 'Autre',
  encaissementsTitle: 'Encaissements',
  student: 'Élève',
  amount: 'Montant',
  noEncaissements: 'Aucun encaissement',
} as const;

function mad(amountMad: number): string {
  return formatMad(amountMad, 'fr', CURRENCY);
}

/**
 * `pdf-lib`-based {@link DayCloseReportPdfRenderer} — the FR-only end-of-day report
 * (SOU-300) on one flat A4 page, reusing the SOU-279 invoice typographic system
 * (Helvetica, PAGE_MARGIN, HAIRLINE_GRAY rules, BRAND_TEAL headings) via
 * {@link InvoicePdfWriter}. Content depends only on `input`; the encaissements list
 * renders only while its rows fit the page (`hasRoomFor`) — a single day never
 * overflows one page in practice, and the report is a summary, not a full ledger.
 */
export class PdfLibDayCloseReportRenderer implements DayCloseReportPdfRenderer {
  async render(input: DayCloseReportPdfInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(patchedFontkit);
    const page = pdfDoc.addPage(PageSizes.A4);
    const [regularFont, boldFont] = await this.embedFonts(pdfDoc);
    const writer = new InvoicePdfWriter({ page, locale: 'fr', regularFont, boldFont });

    const logoBottomY = input.center.logoBytes
      ? await this.drawLogo(pdfDoc, page, input.center.logoBytes)
      : null;

    this.drawHeader(writer, input, logoBottomY);
    this.drawActivityCounts(writer, input.report);
    this.drawCollected(writer, input.report);
    this.drawEncaissements(writer, input.report);

    return pdfDoc.save({ useObjectStreams: false });
  }

  private embedFonts(pdfDoc: PDFDocument): Promise<[PDFFont, PDFFont]> {
    return Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
    ]);
  }

  private drawHeader(
    writer: InvoicePdfWriter,
    input: DayCloseReportPdfInput,
    logoBottomY: number | null,
  ): void {
    writer.text(`${LABELS.title} — ${formatDateLabel(input.report.day, 'fr')}`, {
      size: 22,
      bold: true,
      color: BRAND_TEAL,
    });
    writer.text(input.center.name, { size: 12, bold: true });
    writer.text(`${LABELS.generatedAt} ${formatDateTimeLabel(input.generatedAt)}`, {
      size: 9,
      color: MUTED_GRAY,
    });
    if (logoBottomY !== null) writer.y = Math.min(writer.y, logoBottomY - LOGO_GAP);
    writer.hr();
  }

  private drawActivityCounts(writer: InvoicePdfWriter, report: DayCloseReport): void {
    writer.row(LABELS.newSubscriptions, String(report.newSubscriptions.total), { bold: true });
    writer.row(`   ${LABELS.regular}`, String(report.newSubscriptions.regular), {
      size: 9,
      color: MUTED_GRAY,
    });
    writer.row(`   ${LABELS.examPrep}`, String(report.newSubscriptions.examPrep), {
      size: 9,
      color: MUTED_GRAY,
    });
    writer.row(LABELS.studentsEnrolled, String(report.studentsEnrolled), { bold: true });
    writer.row(LABELS.invoicesGenerated, String(report.invoicesGenerated.count), { bold: true });
    writer.row(`   ${LABELS.totalBilled}`, mad(report.invoicesGenerated.totalBilledMad), {
      size: 9,
      color: MUTED_GRAY,
    });
    writer.hr();
  }

  private drawCollected(writer: InvoicePdfWriter, report: DayCloseReport): void {
    writer.row(LABELS.totalCollected, mad(report.totalCollectedMad), { size: 14, bold: true });
    const { collectedByMethod } = report;
    writer.row(`   ${LABELS.methodCash}`, mad(collectedByMethod.cash), {
      size: 9,
      color: MUTED_GRAY,
    });
    writer.row(`   ${LABELS.methodTransfer}`, mad(collectedByMethod.transfer), {
      size: 9,
      color: MUTED_GRAY,
    });
    writer.row(`   ${LABELS.methodCheque}`, mad(collectedByMethod.cheque), {
      size: 9,
      color: MUTED_GRAY,
    });
    if (collectedByMethod.other !== 0) {
      writer.row(`   ${LABELS.methodOther}`, mad(collectedByMethod.other), {
        size: 9,
        color: MUTED_GRAY,
      });
    }
    writer.hr();
  }

  private drawEncaissements(writer: InvoicePdfWriter, report: DayCloseReport): void {
    writer.text(LABELS.encaissementsTitle, { size: 12, bold: true, color: BRAND_TEAL });
    if (report.encaissements.length === 0) {
      writer.text(LABELS.noEncaissements, { size: 9, color: MUTED_GRAY });
      return;
    }
    writer.row(LABELS.student, LABELS.amount, { size: 9, bold: true, color: MUTED_GRAY });
    writer.rule();
    for (const encaissement of report.encaissements) {
      if (!writer.hasRoomFor(ENCAISSEMENT_ROW_HEIGHT)) break;
      writer.row(encaissement.studentName, mad(encaissement.amountMad), { size: 10 });
    }
  }

  private async drawLogo(pdfDoc: PDFDocument, page: PDFPage, bytes: Uint8Array): Promise<number | null> {
    try {
      const image = await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
      const { width, height } = image.scaleToFit(LOGO_BOX, LOGO_BOX);
      const x = page.getWidth() - PAGE_MARGIN - width;
      const y = page.getHeight() - PAGE_MARGIN - height;
      page.drawImage(image, { x, y, width, height });
      return y;
    } catch {
      return null;
    }
  }
}

function formatDateTimeLabel(value: Date): string {
  return new Intl.DateTimeFormat('fr-MA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
