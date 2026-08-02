import { useTranslation } from 'react-i18next';
import { CheckCheck, Printer } from 'lucide-react';
import { Button, Input, toast } from '@centresoutien/ui';
import type { TeacherPayoutView } from '../../lib/payroll/teacher-payout-view';
import { useGeneratePayslips } from '../../hooks/payroll/use-generate-payslips';
import { useConfirmMonthly } from '../../hooks/payroll/use-confirm-monthly';

type PayrollToolbarProps = {
  month: string;
  onMonthChange: (value: string) => void;
  payouts: readonly TeacherPayoutView[];
};

/** Month picker + the two bulk actions: generate every payslip, mark every draft paid. */
export function PayrollToolbar({ month, onMonthChange, payouts }: PayrollToolbarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';
  const generatePayslips = useGeneratePayslips();
  const confirmMonthly = useConfirmMonthly();
  const hasPayouts = payouts.length > 0;

  const onGeneratePayslips = async () => {
    const { succeeded, failed } = await generatePayslips.mutateAsync({
      teacherPayoutIds: payouts.map((payout) => payout.id),
      locale,
    });
    if (failed === 0) {
      toast.success(t('payroll.toasts.payslipsGenerated', { count: succeeded }));
    } else {
      toast.error(t('payroll.toasts.payslipsPartial', { succeeded, failed }));
    }
  };

  const onMarkAllPaid = async () => {
    try {
      const { confirmed, skippedAlreadyPaid } = await confirmMonthly.mutateAsync(month);
      toast.success(t('payroll.toasts.bulkConfirmSuccess', { confirmed, skipped: skippedAlreadyPaid }));
    } catch {
      toast.error(t('payroll.toasts.bulkConfirmError'));
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Input
        type="month"
        dir="ltr"
        value={month}
        onChange={(event) => onMonthChange(event.target.value)}
        aria-label={t('payroll.monthLabel')}
        className="sm:w-44"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onGeneratePayslips} disabled={!hasPayouts || generatePayslips.isPending}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {generatePayslips.isPending ? t('payroll.actions.generatingPayslips') : t('payroll.actions.generatePayslips')}
        </Button>
        <Button onClick={onMarkAllPaid} disabled={!hasPayouts || confirmMonthly.isPending}>
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          {confirmMonthly.isPending ? t('payroll.actions.markingAllPaid') : t('payroll.actions.markAllPaid')}
        </Button>
      </div>
    </div>
  );
}
