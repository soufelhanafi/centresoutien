import type { TeacherAttributionBreakdownEntryView, TeacherPayoutView } from './teacher-payout-view';
import { mockPayrollGateway } from './mock-payroll-gateway';

export type ConfirmMonthlyResult = {
  readonly confirmed: number;
  readonly skippedAlreadyPaid: number;
};

/**
 * The seam the payroll dashboard depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component. Mirrors
 * `InvoicesGateway`.
 *
 * ## Contract status (SOU-76 frontend ↔ domain-backend)
 *
 * Not yet published: the `payroll.listPayouts` / `payroll.confirmPayout` /
 * `payroll.confirmMonthly` / `payroll.attributionBreakdown` IPC channels. This
 * ships against the in-memory {@link mockPayrollGateway} so the list, drill-down,
 * single-confirm, and bulk-confirm flows are fully wired and exercisable.
 * Swap the active export below to an `IpcPayrollGateway` once the channels land
 * (see `InvoicesGateway`'s own note for the precedent, SOU-69).
 */
export interface PayrollGateway {
  listPayouts(month: string): Promise<readonly TeacherPayoutView[]>;
  confirmPayout(teacherPayoutId: string): Promise<TeacherPayoutView>;
  confirmMonthly(month: string): Promise<ConfirmMonthlyResult>;
  attributionBreakdown(month: string): Promise<readonly TeacherAttributionBreakdownEntryView[]>;
}

/** The active gateway. Swap to the real IPC adapter once SOU-76 domain publishes the channels. */
export const payrollGateway: PayrollGateway = mockPayrollGateway;
