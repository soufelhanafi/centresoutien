import { describe, it, expect } from 'vitest';
import { GetMultiCenterStats } from '../../../src/use-cases/get-multi-center-stats';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type {
  MultiCenterStatsReadPort,
  MultiCenterStatsRawRow,
} from '../../../src/ports/multi-center-stats-read-port';
import { fakeClock } from '../fakes/clock';

function recordingPort(
  rows: readonly MultiCenterStatsRawRow[],
): MultiCenterStatsReadPort & { readonly months: string[] } {
  const months: string[] = [];
  return {
    months,
    readMonthly: async (month) => {
      months.push(month);
      return rows;
    },
  };
}

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

describe('GetMultiCenterStats', () => {
  it('reads the current Clock month and returns the shaped view on Premium (org.multi-center)', async () => {
    const port = recordingPort([
      rawRow({ billedMad: 100_000, collectedMad: 80_000, previousCollectedMad: 40_000, studentCount: 30 }),
      rawRow({
        centreId: 'rabat',
        centerCode: 'CS-RABAT-001',
        displayName: 'Centre Rabat',
        billedMad: 50_000,
        collectedMad: 25_000,
        previousCollectedMad: 20_000,
        studentCount: 12,
      }),
    ]);
    const useCase = new GetMultiCenterStats(
      new PlanPolicy(PLANS.premium),
      port,
      fakeClock('2026-08-15T09:00:00Z'),
    );

    const view = await useCase.execute();

    expect(port.months).toEqual(['2026-08']);
    expect(view.month).toBe('2026-08');
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]?.revenueMad).toBe(100_000);
    expect(view.totals.availableCenterCount).toBe(2);
    expect(view.totals.revenueMad).toBe(150_000);
  });

  it.each(['essentiel', 'pro'] as const)(
    'throws PlanFeatureUnavailableError and never touches the port on %s (no org.multi-center)',
    async (planId) => {
      const port = recordingPort([rawRow()]);
      const useCase = new GetMultiCenterStats(new PlanPolicy(PLANS[planId]), port, fakeClock());

      await expect(useCase.execute()).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(port.months).toEqual([]);
    },
  );

  it('surfaces an unavailable center as a flagged row while still returning the others', async () => {
    const port = recordingPort([
      rawRow({ billedMad: 100_000, collectedMad: 100_000, studentCount: 10 }),
      rawRow({ centreId: 'ghost', centerCode: 'ghost', displayName: 'ghost', unavailable: true }),
    ]);
    const useCase = new GetMultiCenterStats(new PlanPolicy(PLANS.premium), port, fakeClock());

    const view = await useCase.execute();

    expect(view.rows).toHaveLength(2);
    expect(view.rows[1]?.unavailable).toBe(true);
    expect(view.rows[1]?.unpaidRate).toBeNull();
    expect(view.totals.centerCount).toBe(2);
    expect(view.totals.availableCenterCount).toBe(1);
    expect(view.totals.revenueMad).toBe(100_000);
  });
});
