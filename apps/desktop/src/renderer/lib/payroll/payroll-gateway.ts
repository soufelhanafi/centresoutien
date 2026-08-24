import type {
  TeacherAttributionBreakdownEntryView,
  TeacherPayoutView,
  TeacherPayrollProjectionView,
  TeacherProjectedAttributionView,
} from './teacher-payout-view';
import { ipcPayrollGateway } from './ipc-payroll-gateway';

export type ConfirmMonthlyResult = {
  readonly confirmed: number;
  readonly skippedAlreadyPaid: number;
};

export type PayrollProjectionResult = {
  readonly projections: readonly TeacherPayrollProjectionView[];
  readonly projectedBreakdown: readonly TeacherProjectedAttributionView[];
};

/**
 * The seam the payroll dashboard depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component. Mirrors
 * `InvoicesGateway`.
 */
export interface PayrollGateway {
  listPayouts(month: string): Promise<readonly TeacherPayoutView[]>;
  confirmPayout(teacherPayoutId: string): Promise<TeacherPayoutView>;
  confirmMonthly(month: string): Promise<ConfirmMonthlyResult>;
  attributionBreakdown(month: string): Promise<readonly TeacherAttributionBreakdownEntryView[]>;
  getProjection(month: string): Promise<PayrollProjectionResult>;
}

/** The active gateway. */
export const payrollGateway: PayrollGateway = ipcPayrollGateway;
