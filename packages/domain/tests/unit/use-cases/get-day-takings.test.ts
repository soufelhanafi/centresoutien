import { describe, it, expect } from 'vitest';
import { GetDayTakings } from '../../../src/use-cases/get-day-takings';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { RecentPaymentsReadPort } from '../../../src/ports/recent-payments-read-port';
import type { RecentPaymentView } from '../../../src/read-models/recent-payment-view';
import type { DayTakings } from '../../../src/read-models/day-takings';
import type { PaymentKind, PaymentMethod } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { CenterCode } from '../../../src/value-objects/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;

/** A minimal ledger row for the fake: only what the day-takings aggregate reads. */
type LedgerRow = {
  centerCode: CenterCode;
  invoiceId: InvoiceId;
  kind: PaymentKind;
  method: PaymentMethod;
  amountMad: number;
  paidOn: string;
  deletedAt: string | null;
};

const ZERO_BY_METHOD: Record<PaymentMethod, number> = {
  cash: 0,
  cheque: 0,
  transfer: 0,
  other: 0,
};

/**
 * In-memory {@link RecentPaymentsReadPort} whose `getDayTakings` mirrors the SQLite
 * aggregate: center scope, tombstone exclusion, single-day match, signed net
 * (`Σ payments − Σ reversals`) per method, and `paymentCount` over `payment` rows only.
 * `listRecentPayments` is unused here and returns nothing.
 */
class FakeReadPort implements RecentPaymentsReadPort {
  constructor(private readonly rows: readonly LedgerRow[]) {}

  async listRecentPayments(): Promise<readonly RecentPaymentView[]> {
    return [];
  }

  async getDayTakings(centerCode: CenterCode, day: string): Promise<DayTakings> {
    const live = this.rows.filter(
      (row) => row.centerCode === centerCode && row.deletedAt === null && row.paidOn === day,
    );
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

let seq = 0;
function row(over: Partial<LedgerRow> = {}): LedgerRow {
  seq += 1;
  return {
    centerCode: CENTER,
    invoiceId: `inv_${String(seq).padStart(26, '0')}` as InvoiceId,
    kind: 'payment',
    method: 'cash',
    amountMad: 20000,
    paidOn: '2026-08-10',
    deletedAt: null,
    ...over,
  };
}

function planWithout(feature: FeatureFlag): Plan {
  const features = new Set<FeatureFlag>(PLANS.essentiel.features);
  features.delete(feature);
  return { id: 'essentiel', features, limits: PLANS.essentiel.limits };
}

describe('GetDayTakings', () => {
  function build(rows: readonly LedgerRow[], plan: Plan = PLANS.essentiel) {
    return new GetDayTakings(new FakeReadPort(rows), new PlanPolicy(plan));
  }

  it('nets payments and reversals across two invoices for the day', async () => {
    const takings = await build([
      row({ invoiceId: 'inv_00000000000000000000000001' as InvoiceId, method: 'cash', amountMad: 30000 }),
      row({ invoiceId: 'inv_00000000000000000000000002' as InvoiceId, method: 'transfer', amountMad: 20000 }),
      row({
        invoiceId: 'inv_00000000000000000000000001' as InvoiceId,
        kind: 'reversal',
        method: 'cash',
        amountMad: 5000,
      }),
    ]).execute({ centerCode: CENTER, day: '2026-08-10' });

    expect(takings.netMad).toBe(45000); // 30000 + 20000 − 5000
    expect(takings.paymentCount).toBe(2); // reversals excluded from the count
    expect(takings.byMethod).toEqual({ cash: 25000, cheque: 0, transfer: 20000, other: 0 });
  });

  it('returns a negative net for a reversal-only day', async () => {
    const takings = await build([
      row({ kind: 'reversal', method: 'cheque', amountMad: 15000 }),
    ]).execute({ centerCode: CENTER, day: '2026-08-10' });

    expect(takings.netMad).toBe(-15000);
    expect(takings.paymentCount).toBe(0);
    expect(takings.byMethod.cheque).toBe(-15000);
  });

  it('returns an all-zero, non-null shape for an empty day', async () => {
    const takings = await build([row({ paidOn: '2026-08-09' })]).execute({
      centerCode: CENTER,
      day: '2026-08-10',
    });

    expect(takings.netMad).toBe(0);
    expect(takings.paymentCount).toBe(0);
    expect(takings.byMethod).toEqual(ZERO_BY_METHOD);
  });

  it('excludes soft-deleted rows from the total', async () => {
    const takings = await build([
      row({ amountMad: 20000 }),
      row({ amountMad: 99000, deletedAt: '2026-08-11T00:00:00Z' }),
    ]).execute({ centerCode: CENTER, day: '2026-08-10' });

    expect(takings.netMad).toBe(20000);
    expect(takings.paymentCount).toBe(1);
  });

  it('never crosses a center boundary', async () => {
    const takings = await build([
      row({ centerCode: CENTER, amountMad: 20000 }),
      row({ centerCode: OTHER_CENTER, amountMad: 99000 }),
    ]).execute({ centerCode: CENTER, day: '2026-08-10' });

    expect(takings.netMad).toBe(20000);
  });

  it('throws PlanFeatureUnavailableError without core.invoicing', async () => {
    await expect(
      build([row()], planWithout('core.invoicing')).execute({ centerCode: CENTER, day: '2026-08-10' }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
