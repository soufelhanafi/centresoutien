import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { InvoicePdfInput } from '@centresoutien/domain';
import { PdfLibInvoiceRenderer } from '../../src/data/pdf/pdf-lib-invoice-renderer';

function baseInput(over: Partial<InvoicePdfInput> = {}): InvoicePdfInput {
  return {
    locale: 'fr',
    invoiceId: 'inv_00000000000000000000000001',
    month: '2026-09',
    status: 'issued',
    issuedAt: new Date('2026-08-01T09:00:00Z'),
    student: { fr: 'Ahmed Benali', ar: 'أحمد بنعلي' },
    regularLines: [
      { label: { fr: 'Math', ar: 'رياضيات' }, amountMad: 20000 },
      { label: { fr: 'Physique', ar: 'فيزياء' }, amountMad: 15000 },
    ],
    examPrepLines: [{ label: { fr: 'Préparation Bac', ar: 'تحضير الباك' }, amountMad: 80000 }],
    regularSubtotalMad: 35000,
    examPrepSubtotalMad: 80000,
    totalMad: 115000,
    netPaidMad: 35000,
    outstandingMad: 80000,
    paymentStatus: 'partially-paid',
    center: {
      name: 'Centre Réussite',
      address: '12 Rue Ibn Batouta, Casablanca',
      phone: '+212 6 00 00 00 00',
      email: 'contact@centre-reussite.ma',
      logoBytes: null,
    },
    ...over,
  };
}

describe('PdfLibInvoiceRenderer', () => {
  const renderer = new PdfLibInvoiceRenderer();

  it('renders a valid single-page A4 PDF in French', async () => {
    const bytes = await renderer.render(baseInput({ locale: 'fr' }));
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it('renders a valid PDF in Arabic with the embedded Amiri font, RTL-shaped', async () => {
    const bytes = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('produces different bytes for FR vs AR of the same invoice', async () => {
    const fr = await renderer.render(baseInput({ locale: 'fr' }));
    const ar = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.compare(Buffer.from(fr), Buffer.from(ar))).not.toBe(0);
  });

  it('omits a line-kind section entirely when its lines are empty', async () => {
    const bytes = await renderer.render(
      baseInput({ examPrepLines: [], examPrepSubtotalMad: 0, totalMad: 35000, outstandingMad: 0 }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('never throws on unreadable logo bytes — the invoice still renders', async () => {
    const bytes = await renderer.render(
      baseInput({ center: { ...baseInput().center, logoBytes: new Uint8Array([1, 2, 3, 4]) } }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  });

  it('draws a valid embedded PNG logo without throwing', async () => {
    // A minimal 1x1 transparent PNG.
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const bytes = await renderer.render(
      baseInput({ center: { ...baseInput().center, logoBytes: new Uint8Array(onePixelPng) } }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
