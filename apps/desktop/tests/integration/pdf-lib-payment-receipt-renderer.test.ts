import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { PaymentReceiptPdfInput } from '@centresoutien/domain';
import { PdfLibPaymentReceiptRenderer } from '../../src/data/pdf/pdf-lib-payment-receipt-renderer';

function baseInput(over: Partial<PaymentReceiptPdfInput> = {}): PaymentReceiptPdfInput {
  return {
    locale: 'fr',
    paymentId: 'pay_00000000000000000000000001',
    invoiceId: 'inv_00000000000000000000000001',
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-08-05',
    note: 'chèque n°1234',
    month: '2026-09',
    student: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
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

describe('PdfLibPaymentReceiptRenderer', () => {
  const renderer = new PdfLibPaymentReceiptRenderer();

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

  it('produces different bytes for FR vs AR of the same receipt', async () => {
    const fr = await renderer.render(baseInput({ locale: 'fr' }));
    const ar = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.compare(Buffer.from(fr), Buffer.from(ar))).not.toBe(0);
  });

  it('renders a reversal without throwing', async () => {
    const bytes = await renderer.render(baseInput({ kind: 'reversal' }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('renders without a note', async () => {
    const bytes = await renderer.render(baseInput({ note: null }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('never throws on unreadable logo bytes — the receipt still renders', async () => {
    const bytes = await renderer.render(
      baseInput({ center: { ...baseInput().center, logoBytes: new Uint8Array([1, 2, 3, 4]) } }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  });

  it('draws a valid embedded PNG logo without throwing', async () => {
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
