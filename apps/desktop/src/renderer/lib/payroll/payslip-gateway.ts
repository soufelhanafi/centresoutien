/**
 * The seam the "Générer les bulletins" bulk action depends on. Unlike
 * `payrollGateway`, this one is already real: `payslip.print` / `payslip.export`
 * shipped in SOU-75 and are live on this branch's IPC contract.
 */
export interface PayslipGateway {
  /** Renders the payslip PDF in `locale` and opens it in the OS's default viewer. */
  print(teacherPayoutId: string, locale: 'fr' | 'ar'): Promise<void>;
  /**
   * Renders the payslip PDF in `locale` and lets the user pick a save location.
   * `savedPath` is `null` when the save dialog was cancelled.
   */
  export(teacherPayoutId: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }>;
}

class IpcPayslipGateway implements PayslipGateway {
  async print(teacherPayoutId: string, locale: 'fr' | 'ar'): Promise<void> {
    await window.api.invoke('payslip.print', { teacherPayoutId, locale });
  }

  async export(teacherPayoutId: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }> {
    return window.api.invoke('payslip.export', { teacherPayoutId, locale });
  }
}

export const payslipGateway: PayslipGateway = new IpcPayslipGateway();
