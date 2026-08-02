import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { BilingualText, Button, DataTableCell, DataTableRow, Numeric, StatusBadge, toast } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import type { TeacherPayoutView } from '../../lib/payroll/teacher-payout-view';
import { mapTeacherPayoutWriteError } from '../../lib/payroll/teacher-payout-write-error';
import { formatMoneyMad } from '../../lib/format';
import { useConfirmPayout } from '../../hooks/payroll/use-confirm-payout';

type PayrollRowProps = {
  payout: TeacherPayoutView;
  teacher: TeacherView | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
};

/** One teacher payout row: name, rule kind, base amount, total, status, expand + confirm actions. */
export function PayrollRow({ payout, teacher, expanded, onToggleExpand }: PayrollRowProps) {
  const { t, i18n } = useTranslation();
  const confirmPayout = useConfirmPayout();

  const onConfirm = async () => {
    try {
      await confirmPayout.mutateAsync(payout.id);
      toast.success(t('payroll.toasts.confirmSuccess'));
    } catch (error) {
      const code = mapTeacherPayoutWriteError(error);
      toast.error(t(code ? `errors.${code}` : 'payroll.toasts.confirmError'));
    }
  };

  return (
    <DataTableRow>
      <DataTableCell>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'payroll.table.collapse' : 'payroll.table.expand')}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </Button>
          <div>
            <span className="font-medium text-foreground">{teacher?.name.fr ?? t('payroll.unknownTeacher')}</span>
            {teacher && (
              <BilingualText
                value={teacher.name.ar}
                script="arabic"
                className="mt-0.5 block text-xs text-muted-foreground"
              />
            )}
          </div>
        </div>
      </DataTableCell>
      <DataTableCell>{t(`teachers.detail.payroll.kind.${toKindKey(payout.ruleKind)}`)}</DataTableCell>
      <DataTableCell>
        <Numeric>
          {payout.baseAmountMad === null ? t('payroll.table.notApplicable') : formatMoneyMad(payout.baseAmountMad, i18n.language)}
        </Numeric>
      </DataTableCell>
      <DataTableCell>
        <Numeric>{formatMoneyMad(payout.amountMad, i18n.language)}</Numeric>
      </DataTableCell>
      <DataTableCell>
        <StatusBadge status={payout.status} label={t(`payroll.status.${payout.status}`)} />
      </DataTableCell>
      <DataTableCell className="text-end">
        {payout.status === 'draft' && (
          <Button size="sm" variant="outline" onClick={onConfirm} disabled={confirmPayout.isPending}>
            {t('payroll.actions.markPaid')}
          </Button>
        )}
      </DataTableCell>
    </DataTableRow>
  );
}

function toKindKey(kind: TeacherPayoutView['ruleKind']): 'fixedMonthly' | 'percentageOfMonthlyFees' {
  return kind === 'fixed-monthly' ? 'fixedMonthly' : 'percentageOfMonthlyFees';
}
