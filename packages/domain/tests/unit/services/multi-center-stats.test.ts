import { describe, it, expect } from 'vitest';
import {
  buildMultiCenterStatsView,
  deriveUnpaidRate,
  deriveMomGrowthPercent,
} from '../../../src/services/multi-center-stats';
import type { MultiCenterStatsRawRow } from '../../../src/ports/multi-center-stats-read-port';

function rawRow(overrides: Partial<MultiCenterStatsRawRow> = {}): MultiCenterStatsRawRow {
  return {
    centreId: 'casa',
    centerCode: 'CS-CASA-001',
    displayName: 'Centre Casa',
    billedMad: 0,
    collectedMad: 0,
    previousCollectedMad: 0,
    studentCount: 0,
    unavailable: false,
    ...overrides,
  };
}

describe('deriveUnpaidRate', () => {
  it('is unpaid over billed', () => {
    expect(deriveUnpaidRate(100_000, 60_000)).toBe(0.4);
  });

  it('is 0 when everything billed was collected', () => {
    expect(deriveUnpaidRate(100_000, 100_000)).toBe(0);
  });

  it('is null when nothing was billed (divide-by-zero guard)', () => {
    expect(deriveUnpaidRate(0, 0)).toBeNull();
  });

  it('rounds to 4 decimals', () => {
    expect(deriveUnpaidRate(3, 1)).toBe(0.6667);
  });
});

describe('deriveMomGrowthPercent', () => {
  it('is the collected-revenue % delta vs the previous month', () => {
    expect(deriveMomGrowthPercent(150_000, 100_000)).toBe(50);
  });

  it('is negative when revenue shrank', () => {
    expect(deriveMomGrowthPercent(80_000, 100_000)).toBe(-20);
  });

  it('is null when the previous baseline is 0 (no ∞% jump)', () => {
    expect(deriveMomGrowthPercent(100_000, 0)).toBeNull();
  });

  it('rounds to 1 decimal', () => {
    expect(deriveMomGrowthPercent(100_000, 30_000)).toBe(233.3);
  });
});

describe('buildMultiCenterStatsView', () => {
  it('derives each row and sums org totals over AVAILABLE centers', () => {
    const view = buildMultiCenterStatsView('2026-08', [
      rawRow({
        centreId: 'casa',
        billedMad: 100_000,
        collectedMad: 80_000,
        previousCollectedMad: 40_000,
        studentCount: 30,
      }),
      rawRow({
        centreId: 'rabat',
        centerCode: 'CS-RABAT-001',
        displayName: 'Centre Rabat',
        billedMad: 50_000,
        collectedMad: 50_000,
        previousCollectedMad: 0,
        studentCount: 12,
      }),
    ]);

    expect(view.month).toBe('2026-08');
    expect(view.rows[0]).toEqual({
      centreId: 'casa',
      centerCode: 'CS-CASA-001',
      displayName: 'Centre Casa',
      revenueMad: 100_000,
      collectedMad: 80_000,
      studentCount: 30,
      unpaidRate: 0.2,
      momGrowthPercent: 100,
      unavailable: false,
    });
    expect(view.rows[1]?.unpaidRate).toBe(0);
    expect(view.rows[1]?.momGrowthPercent).toBeNull();

    expect(view.totals).toEqual({
      centerCount: 2,
      availableCenterCount: 2,
      revenueMad: 150_000,
      collectedMad: 130_000,
      studentCount: 42,
      unpaidRate: 0.1333,
    });
  });

  it('keeps an unavailable center as a zeroed, flagged row and excludes it from totals', () => {
    const view = buildMultiCenterStatsView('2026-08', [
      rawRow({ centreId: 'casa', billedMad: 100_000, collectedMad: 100_000, studentCount: 10 }),
      rawRow({
        centreId: 'ghost',
        centerCode: 'ghost',
        displayName: 'ghost',
        unavailable: true,
      }),
    ]);

    expect(view.rows).toHaveLength(2);
    expect(view.rows[1]).toMatchObject({
      centreId: 'ghost',
      revenueMad: 0,
      collectedMad: 0,
      studentCount: 0,
      unpaidRate: null,
      momGrowthPercent: null,
      unavailable: true,
    });
    expect(view.totals).toEqual({
      centerCount: 2,
      availableCenterCount: 1,
      revenueMad: 100_000,
      collectedMad: 100_000,
      studentCount: 10,
      unpaidRate: 0,
    });
  });

  it('reports null org unpaidRate when nothing was billed anywhere', () => {
    const view = buildMultiCenterStatsView('2026-08', [rawRow(), rawRow({ centreId: 'rabat' })]);
    expect(view.totals.unpaidRate).toBeNull();
  });
});
