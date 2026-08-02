import { describe, expect, it } from 'vitest';
import { MockPayrollGateway } from '../../../src/renderer/lib/payroll/mock-payroll-gateway';
import { resolveDomainErrorCode } from '../../../src/renderer/lib/ipc/resolve-domain-error-code';

describe('MockPayrollGateway', () => {
  it('lists only the seeded payouts for the requested month', async () => {
    const gateway = new MockPayrollGateway();
    const july = await gateway.listPayouts('2026-07');
    expect(july).toHaveLength(3);
    expect(july.every((payout) => payout.month === '2026-07')).toBe(true);
  });

  it('confirms a draft payout to paid', async () => {
    const gateway = new MockPayrollGateway();
    const [draft] = await gateway.listPayouts('2026-07');
    if (!draft) throw new Error('seed is missing a draft payout for this assertion');

    const confirmed = await gateway.confirmPayout(draft.id);
    expect(confirmed.status).toBe('paid');

    const refetched = await gateway.listPayouts('2026-07');
    expect(refetched.find((payout) => payout.id === draft.id)?.status).toBe('paid');
  });

  it('rejects confirming an already-paid payout with the stable domain error code', async () => {
    const gateway = new MockPayrollGateway();
    const july = await gateway.listPayouts('2026-07');
    const alreadyPaid = july.find((payout) => payout.status === 'paid');
    if (!alreadyPaid) throw new Error('seed is missing an already-paid payout for this assertion');

    await expect(gateway.confirmPayout(alreadyPaid.id)).rejects.toSatisfy((error: unknown) => {
      return resolveDomainErrorCode(error) === 'teacher-payout-already-paid';
    });
  });

  it('rejects confirming an unknown payout id', async () => {
    const gateway = new MockPayrollGateway();
    await expect(gateway.confirmPayout('pyo_unknown')).rejects.toSatisfy((error: unknown) => {
      return resolveDomainErrorCode(error) === 'teacher-payout-not-found';
    });
  });

  it('confirms every live draft for the month in one pass, skip-counting the already-paid one', async () => {
    const gateway = new MockPayrollGateway();
    const result = await gateway.confirmMonthly('2026-07');
    expect(result).toEqual({ confirmed: 2, skippedAlreadyPaid: 1 });

    const july = await gateway.listPayouts('2026-07');
    expect(july.every((payout) => payout.status === 'paid')).toBe(true);
  });

  it('narrows the attribution breakdown to teachers with a live payout in that month', async () => {
    const gateway = new MockPayrollGateway();
    const breakdown = await gateway.attributionBreakdown('2026-07');
    expect(breakdown.length).toBeGreaterThan(0);
    // The stale seed row belongs to a teacher with no payout at all this month.
    expect(breakdown.every((entry) => entry.teacherId !== 'tch_01HW0SEED0000000000000099')).toBe(true);
  });
});
