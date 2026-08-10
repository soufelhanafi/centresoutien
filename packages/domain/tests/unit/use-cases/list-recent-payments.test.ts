import { describe, it, expect, beforeEach } from 'vitest';
import {
  ListRecentPayments,
  RECENT_PAYMENTS_DEFAULT_LIMIT,
  RECENT_PAYMENTS_MAX_LIMIT,
} from '../../../src/use-cases/list-recent-payments';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { InvalidPaymentDateRangeError } from '../../../src/errors/payment-errors';
import type { RecentPaymentsReadPort } from '../../../src/ports/recent-payments-read-port';
import type {
  RecentPaymentView,
  RecentPaymentsFilters,
} from '../../../src/read-models/recent-payment-view';
import type { DayTakings } from '../../../src/read-models/day-takings';
import type { PaymentId } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode } from '../../../src/value-objects/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;

/** One seeded ledger row for the fake: the projected view plus the two columns the
 *  adapter filters on (owning center + soft-delete tombstone) that the read strips. */
type SeedRow = RecentPaymentView & { centerCode: CenterCode; deletedAt: string | null };

/**
 * In-memory {@link RecentPaymentsReadPort} that mirrors the SQLite adapter's read
 * semantics: center scope, tombstone exclusion, inclusive `paid_on` window, most-recent
 * ordering, and the hard `LIMIT`. The use case is the gate + clamp above it; this fake
 * lets the unit test exercise every listed path (≥2 invoices, date filter, empty,
 * soft-deleted excluded) without a database.
 */
class FakeRecentPaymentsReadPort implements RecentPaymentsReadPort {
  lastFilters: RecentPaymentsFilters | null = null;
  constructor(private readonly rows: readonly SeedRow[]) {}

  async listRecentPayments(
    centerCode: CenterCode,
    filters: RecentPaymentsFilters,
  ): Promise<readonly RecentPaymentView[]> {
    this.lastFilters = filters;
    return this.rows
      .filter((row) => row.centerCode === centerCode && row.deletedAt === null)
      .filter((row) => filters.from === undefined || row.paidOn >= filters.from)
      .filter((row) => filters.to === undefined || row.paidOn <= filters.to)
      .sort((a, b) => (a.paidOn === b.paidOn ? b.id.localeCompare(a.id) : b.paidOn.localeCompare(a.paidOn)))
      .slice(0, filters.limit)
      .map(
        (row): RecentPaymentView => ({
          id: row.id,
          invoiceId: row.invoiceId,
          kind: row.kind,
          amountMad: row.amountMad,
          method: row.method,
          paidOn: row.paidOn,
          studentId: row.studentId,
          studentName: row.studentName,
        }),
      );
  }

  async getDayTakings(): Promise<DayTakings> {
    // Not exercised by ListRecentPayments — GetDayTakings has its own suite.
    return { netMad: 0, paymentCount: 0, byMethod: { cash: 0, cheque: 0, transfer: 0, other: 0 } };
  }
}

let seq = 0;
function seed(over: Partial<SeedRow> = {}): SeedRow {
  seq += 1;
  return {
    id: `pay_${String(seq).padStart(26, '0')}` as PaymentId,
    invoiceId: 'inv_00000000000000000000000001' as InvoiceId,
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-08-10',
    studentId: 'stu_00000000000000000000000001' as StudentId,
    studentName: { fr: 'Yassine', ar: 'ياسين' },
    centerCode: CENTER,
    deletedAt: null,
    ...over,
  };
}

function planWithout(feature: FeatureFlag): Plan {
  const features = new Set<FeatureFlag>(PLANS.essentiel.features);
  features.delete(feature);
  return { id: 'essentiel', features, limits: PLANS.essentiel.limits };
}

describe('ListRecentPayments', () => {
  beforeEach(() => {
    seq = 0;
  });

  function build(rows: readonly SeedRow[], plan: Plan = PLANS.essentiel) {
    const port = new FakeRecentPaymentsReadPort(rows);
    return { port, useCase: new ListRecentPayments(port, new PlanPolicy(plan)) };
  }

  it('returns live rows across two invoices, most recent first', async () => {
    const older = seed({ invoiceId: 'inv_00000000000000000000000001' as InvoiceId, paidOn: '2026-08-01' });
    const newer = seed({ invoiceId: 'inv_00000000000000000000000002' as InvoiceId, paidOn: '2026-08-09' });
    const { useCase } = build([older, newer]);

    const rows = await useCase.execute({ centerCode: CENTER });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.invoiceId).toBe('inv_00000000000000000000000002');
    expect(rows[1]?.invoiceId).toBe('inv_00000000000000000000000001');
    expect(new Set(rows.map((r) => r.invoiceId)).size).toBe(2);
  });

  it('applies the inclusive from/to day window', async () => {
    const before = seed({ paidOn: '2026-07-31' });
    const within = seed({ paidOn: '2026-08-10' });
    const after = seed({ paidOn: '2026-09-01' });
    const { useCase, port } = build([before, within, after]);

    const rows = await useCase.execute({ centerCode: CENTER, from: '2026-08-01', to: '2026-08-31' });

    expect(rows.map((r) => r.paidOn)).toEqual(['2026-08-10']);
    expect(port.lastFilters?.from).toBe('2026-08-01');
    expect(port.lastFilters?.to).toBe('2026-08-31');
  });

  it('supports a single "today" query (from === to)', async () => {
    const today = seed({ paidOn: '2026-08-10' });
    const yesterday = seed({ paidOn: '2026-08-09' });
    const { useCase } = build([today, yesterday]);

    const rows = await useCase.execute({ centerCode: CENTER, from: '2026-08-10', to: '2026-08-10' });

    expect(rows.map((r) => r.paidOn)).toEqual(['2026-08-10']);
  });

  it('excludes soft-deleted rows', async () => {
    const live = seed({ paidOn: '2026-08-10' });
    const tombstoned = seed({ paidOn: '2026-08-11', deletedAt: '2026-08-12T00:00:00Z' });
    const { useCase } = build([live, tombstoned]);

    const rows = await useCase.execute({ centerCode: CENTER });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(live.id);
  });

  it('never crosses a center boundary', async () => {
    const mine = seed({ centerCode: CENTER });
    const theirs = seed({ centerCode: OTHER_CENTER });
    const { useCase } = build([mine, theirs]);

    const rows = await useCase.execute({ centerCode: CENTER });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(mine.id);
  });

  it('returns an empty list when the center has no payments', async () => {
    const { useCase } = build([]);
    expect(await useCase.execute({ centerCode: CENTER })).toEqual([]);
  });

  describe('limit clamping', () => {
    it('defaults to RECENT_PAYMENTS_DEFAULT_LIMIT when omitted', async () => {
      const { useCase, port } = build([seed()]);
      await useCase.execute({ centerCode: CENTER });
      expect(port.lastFilters?.limit).toBe(RECENT_PAYMENTS_DEFAULT_LIMIT);
    });

    it('caps an over-max request at RECENT_PAYMENTS_MAX_LIMIT', async () => {
      const { useCase, port } = build([seed()]);
      await useCase.execute({ centerCode: CENTER, limit: 100000 });
      expect(port.lastFilters?.limit).toBe(RECENT_PAYMENTS_MAX_LIMIT);
    });

    it('floors a below-1 request to 1', async () => {
      const { useCase, port } = build([seed()]);
      await useCase.execute({ centerCode: CENTER, limit: 0 });
      expect(port.lastFilters?.limit).toBe(1);
    });

    it('passes a valid in-range limit through untouched', async () => {
      const { useCase, port } = build([seed()]);
      await useCase.execute({ centerCode: CENTER, limit: 25 });
      expect(port.lastFilters?.limit).toBe(25);
    });
  });

  describe('validation', () => {
    it('throws InvalidPaymentDateRangeError when from is after to', async () => {
      const { useCase } = build([seed()]);
      await expect(
        useCase.execute({ centerCode: CENTER, from: '2026-08-31', to: '2026-08-01' }),
      ).rejects.toBeInstanceOf(InvalidPaymentDateRangeError);
    });

    it('accepts an equal from/to (single day) without throwing', async () => {
      const { useCase } = build([seed({ paidOn: '2026-08-10' })]);
      const rows = await useCase.execute({ centerCode: CENTER, from: '2026-08-10', to: '2026-08-10' });
      expect(rows).toHaveLength(1);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError without core.invoicing', async () => {
      const { useCase } = build([seed()], planWithout('core.invoicing'));
      await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
