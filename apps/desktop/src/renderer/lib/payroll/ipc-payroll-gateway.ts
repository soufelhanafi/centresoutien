import type { ConfirmMonthlyResult, PayrollGateway, PayrollProjectionResult } from './payroll-gateway';
import type { TeacherAttributionBreakdownEntryView, TeacherPayoutView } from './teacher-payout-view';

/**
 * The real {@link PayrollGateway}: maps each method onto its typed IPC channel
 * (SOU-76), same shape as `ipc-invoices-gateway.ts`.
 */
class IpcPayrollGateway implements PayrollGateway {
  async listPayouts(month: string): Promise<readonly TeacherPayoutView[]> {
    const { payouts } = await window.api.invoke('payroll.listPayouts', { month });
    return payouts;
  }

  async confirmPayout(teacherPayoutId: string): Promise<TeacherPayoutView> {
    const { payout } = await window.api.invoke('payroll.confirmPayout', { teacherPayoutId });
    return payout;
  }

  async confirmMonthly(month: string): Promise<ConfirmMonthlyResult> {
    return window.api.invoke('payroll.confirmMonthly', { month });
  }

  async attributionBreakdown(month: string): Promise<readonly TeacherAttributionBreakdownEntryView[]> {
    const { breakdown } = await window.api.invoke('payroll.attributionBreakdown', { month });
    return breakdown;
  }

  async getProjection(month: string): Promise<PayrollProjectionResult> {
    return window.api.invoke('payroll.projection', { month });
  }
}

export const ipcPayrollGateway: PayrollGateway = new IpcPayrollGateway();
