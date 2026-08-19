import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { ParentStatementPdfInput, ParentStatementPdfChild } from '@centresoutien/domain';
import { PdfLibParentStatementRenderer } from '../../src/data/pdf/pdf-lib-parent-statement-renderer';

function child(over: Partial<ParentStatementPdfChild> = {}): ParentStatementPdfChild {
  return {
    childName: { fr: 'Amine Alaoui', ar: 'أمين العلوي' },
    invoiceId: 'inv_00000000000000000000000001',
    invoiceStatus: 'issued',
    paymentStatus: 'partially-paid',
    regularLines: [
      { label: { fr: 'Math', ar: 'رياضيات' }, amountMad: 20000 },
      { label: { fr: 'Physique', ar: 'فيزياء' }, amountMad: 15000 },
    ],
    examPrepLines: [{ label: { fr: 'Préparation Bac', ar: 'تحضير الباك' }, amountMad: 80000 }],
    regularSubtotalMad: 35000,
    examPrepSubtotalMad: 80000,
    childTotalMad: 115000,
    childNetPaidMad: 35000,
    childOutstandingMad: 80000,
    ...over,
  };
}

function baseInput(over: Partial<ParentStatementPdfInput> = {}): ParentStatementPdfInput {
  return {
    locale: 'fr',
    parentName: 'M. Alaoui',
    month: '2026-09',
    children: [child()],
    grandTotalMad: 115000,
    totalReceivedMad: 35000,
    outstandingMad: 80000,
    aggregateStatus: 'partially-paid',
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

const paid = baseInput({
  children: [child({ paymentStatus: 'paid', childNetPaidMad: 115000, childOutstandingMad: 0 })],
  totalReceivedMad: 115000,
  outstandingMad: 0,
  aggregateStatus: 'paid',
});

const unpaid = baseInput({
  children: [child({ paymentStatus: 'unpaid', childNetPaidMad: 0, childOutstandingMad: 115000 })],
  totalReceivedMad: 0,
  outstandingMad: 115000,
  aggregateStatus: 'unpaid',
});

async function renderPage(input: ParentStatementPdfInput) {
  const bytes = await new PdfLibParentStatementRenderer().render(input);
  expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  const doc = await PDFDocument.load(bytes);
  return { bytes, doc };
}

describe('PdfLibParentStatementRenderer', () => {
  const renderer = new PdfLibParentStatementRenderer();

  it('renders a valid single-page A4 PDF', async () => {
    const { doc } = await renderPage(baseInput());
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it('embeds only the standard Helvetica faces — FR-only, no Amiri (Arabic dropped)', async () => {
    const text = Buffer.from(await renderer.render(baseInput())).toString('latin1');
    expect(text).toContain('Helvetica');
    expect(text).not.toContain('Amiri');
  });

  it('renders FR regardless of the input locale (Arabic dropped, SOU-271)', async () => {
    const fr = await renderer.render(baseInput({ locale: 'fr' }));
    const ar = await renderer.render(baseInput({ locale: 'ar' }));
    expect(Buffer.compare(Buffer.from(fr), Buffer.from(ar))).toBe(0);
  });

  it('drives visible content from aggregate status — each state produces different bytes', async () => {
    const [unpaidBytes, partialBytes, paidBytes] = await Promise.all(
      [unpaid, baseInput(), paid].map((input) => renderer.render(input)),
    );
    const buffers = [unpaidBytes, partialBytes, paidBytes].map((bytes) => Buffer.from(bytes));
    for (let i = 0; i < buffers.length; i += 1) {
      for (let j = i + 1; j < buffers.length; j += 1) {
        expect(Buffer.compare(buffers[i]!, buffers[j]!)).not.toBe(0);
      }
    }
  });

  it('renders a zero-invoice child block (« Aucune facture ») on one page', async () => {
    const { doc } = await renderPage(
      baseInput({
        children: [
          child(),
          child({
            childName: { fr: 'Sara Alaoui', ar: 'سارة' },
            invoiceId: null,
            invoiceStatus: null,
            paymentStatus: 'unpaid',
            regularLines: [],
            examPrepLines: [],
            regularSubtotalMad: 0,
            examPrepSubtotalMad: 0,
            childTotalMad: 0,
            childNetPaidMad: 0,
            childOutstandingMad: 0,
          }),
        ],
      }),
    );
    expect(doc.getPageCount()).toBe(1);
  });

  it('renders a multi-child statement (one block per child) on a single page', async () => {
    const { doc } = await renderPage(
      baseInput({
        children: [
          child({ childName: { fr: 'Amine Alaoui', ar: 'أمين' } }),
          child({
            childName: { fr: 'Zaid Alaoui', ar: 'زيد' },
            invoiceId: 'inv_00000000000000000000000002',
            paymentStatus: 'paid',
            examPrepLines: [],
            examPrepSubtotalMad: 0,
            childTotalMad: 35000,
            childNetPaidMad: 35000,
            childOutstandingMad: 0,
          }),
        ],
        grandTotalMad: 150000,
        totalReceivedMad: 70000,
        outstandingMad: 80000,
      }),
    );
    expect(doc.getPageCount()).toBe(1);
  });

  it('never throws on unreadable logo bytes — the statement still renders', async () => {
    const bytes = await renderer.render(
      baseInput({ center: { ...baseInput().center, logoBytes: new Uint8Array([1, 2, 3, 4]) } }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  });
});
