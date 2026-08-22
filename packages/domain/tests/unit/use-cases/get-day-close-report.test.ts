import { describe, it, expect } from 'vitest';
import { GetDayCloseReport } from '../../../src/use-cases/get-day-close-report';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { RecentPaymentsReadPort } from '../../../src/ports/recent-payments-read-port';
import type {
  DayCloseActivityReadPort,
  DayCloseActivityCounts,
  DayCloseActivityRange,
} from '../../../src/ports/day-close-activity-read-port';
import type { RecentPaymentView, RecentPaymentsFilters } from '../../../src/read-models/recent-payment-view';
import type { DayTakings } from '../../../src/read-models/day-takings';
import type { PaymentKind, PaymentMethod } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { PaymentId } from '../../../src/entities/payment';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode } from '../../../src/value-objects/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DAY = '2026-08-10';

const ZERO_BY_METHOD: Record<PaymentMethod, number> = {
  cash: 0,
  cheque: 0,
  transfer: 0,
  other: 0,
};

type LedgerRow = {
  centerCode: CenterCode;
  kind: PaymentKind;
  method: PaymentMethod;
  amountMad: number;
  paidOn: string;
  createdAt: Date;
  studentName: { fr: string; ar: string } | null;
};

/**
 * In-memory {@link RecentPaymentsReadPort} covering both reads the use case makes:
 * `getDayTakings` nets the day's rows in-memory (center scope, single-day, signed
 * net, `payment`-only count) and `listRecentPayments` returns the day's rows within
 * the `[from,to]` window, both kinds — the use case filters to `payment` itself.
 */
class FakePaymentsPort implements RecentPaymentsReadPort {
  constructor(private readonly rows: readonly LedgerRow[]) {}

  async listRecentPayments(
    centerCode: CenterCode,
    filters: RecentPaymentsFilters,
  ): Promise<readonly RecentPaymentView[]> {
    let seq = 0;
    return this.rows
      .filter(
        (row) =>
          row.centerCode === centerCode &&
          (filters.from === undefined || row.paidOn >= filters.from) &&
          (filters.to === undefined || row.paidOn <= filters.to),
      )
      .map((row) => {
        seq += 1;
        return {
          id: `pay_${String(seq).padStart(26, '0')}` as PaymentId,
          invoiceId: `inv_${String(seq).padStart(26, '0')}` as InvoiceId,
          kind: row.kind,
          amountMad: row.amountMad,
          method: row.method,
          paidOn: row.paidOn,
          createdAt: row.createdAt,
          studentId: `stu_${String(seq).padStart(26, '0')}` as StudentId,
          studentName: row.studentName,
        };
      });
  }

  async getDayTakings(centerCode: CenterCode, day: string): Promise<DayTakings> {
    const live = this.rows.filter((row) => row.centerCode === centerCode && row.paidOn === day);
    const byMethod: Record<PaymentMethod, number> = { ...ZERO_BY_METHOD };
    let netMad = 0;
    let paymentCount = 0;
    for (const row of live) {
      const signed = row.kind === 'reversal' ? -row.amountMad : row.amountMad;
      byMethod[row.method] += signed;
      netMad += signed;
      if (row.kind === 'payment') paymentCount += 1;
    }
    return { netMad, paymentCount, byMethod };
  }
}

/** Records the range it was called with and returns a fixed count set. */
class FakeActivityPort implements DayCloseActivityReadPort {
  public lastRange: DayCloseActivityRange | null = null;
  public lastCenter: CenterCode | null = null;

  constructor(private readonly counts: DayCloseActivityCounts) {}

  async getDayCloseActivity(
    centerCode: CenterCode,
    range: DayCloseActivityRange,
  ): Promise<DayCloseActivityCounts> {
    this.lastCenter = centerCode;
    this.lastRange = range;
    return this.counts;
  }
}

const EMPTY_ACTIVITY: DayCloseActivityCounts = {
  newSubscriptions: { regular: 0, examPrep: 0, total: 0 },
  studentsEnrolled: 0,
  invoicesGenerated: { count: 0, totalBilledMad: 0 },
};

function planWithout(feature: FeatureFlag): Plan {
  const features = new Set<FeatureFlag>(PLANS.essentiel.features);
  features.delete(feature);
  return { id: 'essentiel', features, limits: PLANS.essentiel.limits };
}

function payment(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    centerCode: CENTER,
    kind: 'payment',
    method: 'cash',
    amountMad: 20000,
    paidOn: DAY,
    createdAt: new Date(`${DAY}T14:30:00.000Z`),
    studentName: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    ...over,
  };
}

describe('GetDayCloseReport', () => {
  function build(
    rows: readonly LedgerRow[],
    counts: DayCloseActivityCounts = EMPTY_ACTIVITY,
    plan: Plan = PLANS.essentiel,
  ) {
    const activity = new FakeActivityPort(counts);
    const useCase = new GetDayCloseReport(new FakePaymentsPort(rows), activity, new PlanPolicy(plan));
    return { useCase, activity };
  }

  it('composes takings, activity counts, and the encaissements list for the day', async () => {
    const counts: DayCloseActivityCounts = {
      newSubscriptions: { regular: 3, examPrep: 1, total: 4 },
      studentsEnrolled: 5,
      invoicesGenerated: { count: 7, totalBilledMad: 140000 },
    };
    const { useCase, activity } = build(
      [
        payment({ method: 'cash', amountMad: 30000 }),
        payment({ method: 'transfer', amountMad: 20000 }),
        payment({ kind: 'reversal', method: 'cash', amountMad: 5000 }),
      ],
      counts,
    );

    const report = await useCase.execute({ centerCode: CENTER, day: DAY });

    expect(report.day).toBe(DAY);
    expect(report.newSubscriptions).toEqual({ regular: 3, examPrep: 1, total: 4 });
    expect(report.studentsEnrolled).toBe(5);
    expect(report.invoicesGenerated).toEqual({ count: 7, totalBilledMad: 140000 });
    expect(report.totalCollectedMad).toBe(45000); // 30000 + 20000 − 5000
    expect(report.collectedByMethod).toEqual({ cash: 25000, cheque: 0, transfer: 20000, other: 0 });
    // encaissements exclude the reversal; two payment rows remain
    expect(report.encaissements).toHaveLength(2);
    // activity was queried with a single-day window
    expect(activity.lastRange).toEqual({ from: DAY, to: DAY });
    expect(activity.lastCenter).toBe(CENTER);
  });

  it('maps payment rows to encaissements and excludes reversals', async () => {
    const { useCase } = build([
      payment({ amountMad: 30000, studentName: { fr: 'Salma Bennani', ar: 'سلمى بناني' } }),
      payment({ kind: 'reversal', amountMad: 5000 }),
    ]);

    const report = await useCase.execute({ centerCode: CENTER, day: DAY });

    expect(report.encaissements).toEqual([
      { studentName: 'Salma Bennani', amountMad: 30000, at: `${DAY}T14:30:00.000Z` },
    ]);
  });

  it('falls back to an empty student name when the payer name has not resolved', async () => {
    const { useCase } = build([payment({ studentName: null })]);

    const report = await useCase.execute({ centerCode: CENTER, day: DAY });

    expect(report.encaissements[0]?.studentName).toBe('');
  });

  it('returns an all-zero, non-null shape for an empty day (all four method keys present)', async () => {
    const { useCase } = build([]);

    const report = await useCase.execute({ centerCode: CENTER, day: DAY });

    expect(report.totalCollectedMad).toBe(0);
    expect(report.collectedByMethod).toEqual(ZERO_BY_METHOD);
    expect(report.newSubscriptions).toEqual({ regular: 0, examPrep: 0, total: 0 });
    expect(report.studentsEnrolled).toBe(0);
    expect(report.invoicesGenerated).toEqual({ count: 0, totalBilledMad: 0 });
    expect(report.encaissements).toEqual([]);
  });

  it('splits collected money by method', async () => {
    const { useCase } = build([
      payment({ method: 'cash', amountMad: 10000 }),
      payment({ method: 'cheque', amountMad: 25000 }),
      payment({ method: 'transfer', amountMad: 40000 }),
      payment({ method: 'other', amountMad: 5000 }),
    ]);

    const report = await useCase.execute({ centerCode: CENTER, day: DAY });

    expect(report.collectedByMethod).toEqual({ cash: 10000, cheque: 25000, transfer: 40000, other: 5000 });
    expect(report.totalCollectedMad).toBe(80000);
  });

  it('never crosses a center boundary', async () => {
    const { useCase } = build([
      payment({ centerCode: CENTER, amountMad: 20000 }),
      payment({ centerCode: OTHER_CENTER, amountMad: 99000 }),
    ]);

    const report = await useCase.execute({ centerCode: CENTER, day: DAY });

    expect(report.totalCollectedMad).toBe(20000);
    expect(report.encaissements).toHaveLength(1);
  });

  it('throws PlanFeatureUnavailableError without core.invoicing', async () => {
    const { useCase } = build([payment()], EMPTY_ACTIVITY, planWithout('core.invoicing'));

    await expect(useCase.execute({ centerCode: CENTER, day: DAY })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
