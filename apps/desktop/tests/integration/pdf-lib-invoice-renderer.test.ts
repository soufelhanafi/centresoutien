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

const unpaid = baseInput({ paymentStatus: 'unpaid', netPaidMad: 0, outstandingMad: 115000 });
const partiallyPaid = baseInput();
const paid = baseInput({ paymentStatus: 'paid', netPaidMad: 115000, outstandingMad: 0 });
const cancelled = baseInput({ status: 'cancelled', paymentStatus: 'unpaid', netPaidMad: 0, outstandingMad: 115000 });

async function renderPage(input: InvoicePdfInput) {
  const bytes = await new PdfLibInvoiceRenderer().render(input);
  expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  const doc = await PDFDocument.load(bytes);
  return { bytes, doc };
}

describe('PdfLibInvoiceRenderer', () => {
  const renderer = new PdfLibInvoiceRenderer();

  it('renders a valid single-page A4 PDF', async () => {
    const { doc } = await renderPage(partiallyPaid);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it.each([
    ['non réglée', unpaid],
    ['payée partiellement', partiallyPaid],
    ['payée', paid],
    ['annulée', cancelled],
  ] as const)('renders the "%s" invoice on a single page', async (_label, input) => {
    const { doc } = await renderPage(input);
    expect(doc.getPageCount()).toBe(1);
  });

  it('drives visible content from status — each state produces different bytes', async () => {
    const [unpaidBytes, partialBytes, paidBytes, cancelledBytes] = await Promise.all(
      [unpaid, partiallyPaid, paid, cancelled].map((input) => renderer.render(input)),
    );
    const buffers = [unpaidBytes, partialBytes, paidBytes, cancelledBytes].map((bytes) => Buffer.from(bytes));
    for (let i = 0; i < buffers.length; i += 1) {
      for (let j = i + 1; j < buffers.length; j += 1) {
        expect(Buffer.compare(buffers[i]!, buffers[j]!)).not.toBe(0);
      }
    }
  });

  it('renders FR regardless of the input locale (Arabic dropped, SOU-271)', async () => {
    const fr = await renderer.render(baseInput({ locale: 'fr' }));
    const ar = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.compare(Buffer.from(fr), Buffer.from(ar))).toBe(0);
  });

  it('omits a line-kind section entirely when its lines are empty', async () => {
    const { doc } = await renderPage(
      baseInput({
        examPrepLines: [],
        examPrepSubtotalMad: 0,
        totalMad: 35000,
        paymentStatus: 'paid',
        netPaidMad: 35000,
        outstandingMad: 0,
      }),
    );
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
    const { doc } = await renderPage(
      baseInput({ center: { ...baseInput().center, logoBytes: new Uint8Array(onePixelPng) } }),
    );
    expect(doc.getPageCount()).toBe(1);
  });
});
