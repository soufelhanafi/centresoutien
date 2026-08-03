import { useMutation } from '@tanstack/react-query';
import { payslipGateway } from '../../lib/payroll/payslip-gateway';

export type GeneratePayslipsResult = { readonly succeeded: number; readonly failed: number };

/**
 * The "Générer les bulletins" bulk action: opens every payout's payslip PDF in
 * the OS's default viewer, one after another. Uses `payslip.print`, not
 * `payslip.export` — export shows one native save dialog per file, which would
 * mean N blocking dialogs for N teachers; print opens each PDF straight away
 * with no dialog at all, the only one of the two shipped flows that scales to
 * a whole month's roster in one click (CLAUDE.md's "under 2 minutes" done-when).
 * Sequential, not `Promise.all`, so PDF viewer windows open in a predictable
 * order and one failure doesn't cancel the rest.
 */
export function useGeneratePayslips() {
  return useMutation({
    mutationFn: async ({
      teacherPayoutIds,
      locale,
    }: {
      teacherPayoutIds: readonly string[];
      locale: 'fr' | 'ar';
    }): Promise<GeneratePayslipsResult> => {
      let succeeded = 0;
      let failed = 0;
      for (const teacherPayoutId of teacherPayoutIds) {
        try {
          await payslipGateway.print(teacherPayoutId, locale);
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      return { succeeded, failed };
    },
  });
}
