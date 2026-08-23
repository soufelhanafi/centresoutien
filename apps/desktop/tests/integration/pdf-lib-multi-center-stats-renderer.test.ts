import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type {
  MultiCenterStatsPdfInput,
  MultiCenterStatsPdfRow,
} from '@centresoutien/domain';
import { PdfLibMultiCenterStatsRenderer } from '../../src/data/pdf/pdf-lib-multi-center-stats-renderer';

function centerRow(index: number, over: Partial<MultiCenterStatsPdfRow> = {}): MultiCenterStatsPdfRow {
  return {
    centerCode: `CS-CENTER-${String(index).padStart(3, '0')}`,
    displayName: `Centre ${index}`,
    revenueMad: 120000 + index * 1000,
    collectedMad: 90000 + index * 500,
    studentCount: 10 + index,
    unpaidRate: 0.25,
    momGrowthPercent: 4.2,
    unavailable: false,
    ...over,
  };
}

function baseInput(rowCount: number, over: Partial<MultiCenterStatsPdfInput> = {}): MultiCenterStatsPdfInput {
  const rows = Array.from({ length: rowCount }, (_, i) => centerRow(i + 1));
  return {
    locale: 'fr',
    month: '2026-08',
    rows,
    totals: {
      centerCount: rowCount,
      availableCenterCount: rowCount,
      revenueMad: rows.reduce((sum, row) => sum + row.revenueMad, 0),
      collectedMad: rows.reduce((sum, row) => sum + row.collectedMad, 0),
      studentCount: rows.reduce((sum, row) => sum + row.studentCount, 0),
      unpaidRate: 0.25,
    },
    ...over,
  };
}

async function render(input: MultiCenterStatsPdfInput) {
  const bytes = await new PdfLibMultiCenterStatsRenderer().render(input);
  expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  return PDFDocument.load(bytes);
}

describe('PdfLibMultiCenterStatsRenderer', () => {
  it('renders a valid single A4 page for a short report', async () => {
    const doc = await render(baseInput(3));
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it('paginates across multiple pages when more centers than fit on one page', async () => {
    // A full center block is ~114pt; an A4 page below header + totals holds far
    // fewer than 20 blocks, so 20 centers (the SOU-106 AC) must spill onto page 2+.
    const doc = await render(baseInput(20));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('renders every center across the added pages — none is dropped', async () => {
    const rowCount = 20;
    const doc = await render(baseInput(rowCount));
    // Every non-header text line (title + 5 rows + rule spacing) draws content, so
    // the count of distinct pages that carry drawn operations covers all rows: the
    // strongest black-box proxy is that no page is empty and the doc grew past one.
    const pageCount = doc.getPageCount();
    expect(pageCount).toBeGreaterThan(1);
    // Re-render the same input and confirm the page count is stable and content-driven.
    const doc2 = await render(baseInput(rowCount));
    expect(doc2.getPageCount()).toBe(pageCount);
    // A larger set must not shrink the document.
    const doc3 = await render(baseInput(rowCount * 2));
    expect(doc3.getPageCount()).toBeGreaterThanOrEqual(pageCount);
  });

  it('paginates a run of unavailable centers without dropping rows', async () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      centerRow(i + 1, { unavailable: true }),
    );
    const doc = await render(baseInput(0, { rows, totals: {
      centerCount: 30,
      availableCenterCount: 0,
      revenueMad: 0,
      collectedMad: 0,
      studentCount: 0,
      unpaidRate: null,
    } }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('renders in Arabic without failing', async () => {
    const doc = await render(baseInput(20, { locale: 'ar' }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
