import { encodeDomainError } from '../../../shared/ipc/domain-error';
import type { ConfirmMonthlyResult, PayrollGateway } from './payroll-gateway';
import type { TeacherAttributionBreakdownEntryView, TeacherPayoutView } from './teacher-payout-view';
import { ATTRIBUTION_BREAKDOWN_SEED, TEACHER_PAYOUT_SEED } from './mock-payroll-seed';

/**
 * In-memory stand-in for the not-yet-published payroll dashboard channels
 * (see `payroll-gateway.ts`). `confirmPayout` mirrors the real
 * `ConfirmTeacherPayout` use case: a repeat target rejects with the same
 * encoded `teacher-payout-already-paid` domain error shape the real IPC
 * rejection carries, so `resolveDomainErrorCode` resolves it identically.
 */
export class MockPayrollGateway implements PayrollGateway {
  private readonly payouts = new Map<string, TeacherPayoutView>(
    TEACHER_PAYOUT_SEED.map((payout) => [payout.id, payout]),
  );
  private readonly breakdown = ATTRIBUTION_BREAKDOWN_SEED;

  async listPayouts(month: string): Promise<readonly TeacherPayoutView[]> {
    return [...this.payouts.values()].filter((payout) => payout.month === month);
  }

  async confirmPayout(teacherPayoutId: string): Promise<TeacherPayoutView> {
    const existing = this.payouts.get(teacherPayoutId);
    if (existing === undefined) {
      throw new Error(
        encodeDomainError({ code: 'teacher-payout-not-found', message: `No teacher payout "${teacherPayoutId}".` }),
      );
    }
    if (existing.status === 'paid') {
      throw new Error(
        encodeDomainError({
          code: 'teacher-payout-already-paid',
          message: `Teacher payout "${teacherPayoutId}" is already paid.`,
        }),
      );
    }
    const confirmed: TeacherPayoutView = { ...existing, status: 'paid' };
    this.payouts.set(confirmed.id, confirmed);
    return confirmed;
  }

  async confirmMonthly(month: string): Promise<ConfirmMonthlyResult> {
    let confirmed = 0;
    let skippedAlreadyPaid = 0;
    for (const payout of this.payouts.values()) {
      if (payout.month !== month) continue;
      if (payout.status === 'paid') {
        skippedAlreadyPaid += 1;
        continue;
      }
      this.payouts.set(payout.id, { ...payout, status: 'paid' });
      confirmed += 1;
    }
    return { confirmed, skippedAlreadyPaid };
  }

  async attributionBreakdown(month: string): Promise<readonly TeacherAttributionBreakdownEntryView[]> {
    const teacherIdsInMonth = new Set(
      [...this.payouts.values()].filter((payout) => payout.month === month).map((payout) => payout.teacherId),
    );
    return this.breakdown.filter((entry) => teacherIdsInMonth.has(entry.teacherId));
  }
}

export const mockPayrollGateway = new MockPayrollGateway();
