import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { DayCloseReportPdfInput } from '@centresoutien/domain';
import { PdfLibDayCloseReportRenderer } from '../../src/data/pdf/pdf-lib-day-close-report-renderer';

function baseInput(over: Partial<DayCloseReportPdfInput> = {}): DayCloseReportPdfInput {
  return {
    generatedAt: new Date('2026-08-22T14:30:00Z'),
    center: {
      name: 'Centre Réussite',
      address: '12 Rue Ibn Batouta, Casablanca',
      phone: '+212 6 00 00 00 00',
      email: 'contact@centre-reussite.ma',
      logoBytes: null,
    },
    report: {
      day: '2026-08-22',
      newSubscriptions: { regular: 3, examPrep: 1, total: 4 },
      studentsEnrolled: 5,
      invoicesGenerated: { count: 7, totalBilledMad: 140000 },
      totalCollectedMad: 45000,
      collectedByMethod: { cash: 25000, cheque: 0, transfer: 20000, other: 0 },
      encaissements: [
        { studentName: 'Ahmed Benali', amountMad: 25000, at: '2026-08-22T00:00:00.000Z' },
        { studentName: 'Salma Bennani', amountMad: 20000, at: '2026-08-22T00:00:00.000Z' },
      ],
    },
    ...over,
  };
}

async function renderPage(input: DayCloseReportPdfInput) {
  const bytes = await new PdfLibDayCloseReportRenderer().render(input);
  expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  return PDFDocument.load(bytes);
}

describe('PdfLibDayCloseReportRenderer', () => {
  it('renders a valid single-page A4 PDF', async () => {
    const doc = await renderPage(baseInput());
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it('renders an empty day with no encaissements', async () => {
    const doc = await renderPage(
      baseInput({
        report: {
          day: '2026-08-22',
          newSubscriptions: { regular: 0, examPrep: 0, total: 0 },
          studentsEnrolled: 0,
          invoicesGenerated: { count: 0, totalBilledMad: 0 },
          totalCollectedMad: 0,
          collectedByMethod: { cash: 0, cheque: 0, transfer: 0, other: 0 },
          encaissements: [],
        },
      }),
    );
    expect(doc.getPageCount()).toBe(1);
  });

  it('tolerates an unreadable logo without failing the render', async () => {
    const doc = await renderPage(
      baseInput({
        center: {
          name: 'Centre Réussite',
          address: '',
          phone: '',
          email: '',
          logoBytes: new Uint8Array([1, 2, 3, 4]),
        },
      }),
    );
    expect(doc.getPageCount()).toBe(1);
  });
});
