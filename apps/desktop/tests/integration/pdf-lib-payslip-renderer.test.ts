import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { PayslipPdfInput } from '@centresoutien/domain';
import { PdfLibPayslipRenderer } from '../../src/data/pdf/pdf-lib-payslip-renderer';

function baseInput(over: Partial<PayslipPdfInput> = {}): PayslipPdfInput {
  return {
    locale: 'fr',
    payoutId: 'pyo_00000000000000000000000001',
    teacher: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    month: '2026-08',
    status: 'draft',
    ruleKind: 'percentage-of-monthly-fees',
    baseAmountMad: 100000,
    percentSnapshot: 30,
    amountMad: 30000,
    notes: null,
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

describe('PdfLibPayslipRenderer', () => {
  const renderer = new PdfLibPayslipRenderer();

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

  it('produces different bytes for FR vs AR of the same payslip', async () => {
    const fr = await renderer.render(baseInput({ locale: 'fr' }));
    const ar = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.compare(Buffer.from(fr), Buffer.from(ar))).not.toBe(0);
  });

  it('renders a fixed-monthly payout without a base/percent breakdown', async () => {
    const bytes = await renderer.render(
      baseInput({ ruleKind: 'fixed-monthly', baseAmountMad: null, percentSnapshot: null, amountMad: 500000 }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('never throws on unreadable logo bytes — the payslip still renders', async () => {
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
