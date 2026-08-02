import { useTranslation } from 'react-i18next';
import { Badge, DataTable, DataTableCell, DataTableHead, DataTableRow, Numeric } from '@centresoutien/ui';
import type { TeacherPayrollRuleView } from '../../lib/teacher-payroll-rules/teacher-payroll-rule-view';
import { formatMad } from '../../lib/formulas/price-mad';
import { formatMonth, formatPercent } from '../../lib/format';

const COLUMNS = ['1fr', '1fr', '1.4fr'] as const;

const kindLabelKey = (kind: TeacherPayrollRuleView['kind']) =>
  kind === 'fixed-monthly' ? 'fixedMonthly' : 'percentageOfMonthlyFees';

/** Past (closed) payroll rules for one teacher, oldest actions surfaced via `rules` order from the caller. */
export function TeacherPayrollRuleHistoryTable({ rules }: { rules: readonly TeacherPayrollRuleView[] }) {
  const { t, i18n } = useTranslation();

  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('teachers.detail.payroll.history.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('teachers.detail.payroll.history.kind')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.payroll.history.amount')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.payroll.history.period')}</DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <DataTableRow key={rule.id}>
              <DataTableCell>
                <Badge variant="neutral">{t(`teachers.detail.payroll.kind.${kindLabelKey(rule.kind)}`)}</Badge>
              </DataTableCell>
              <DataTableCell>
                <Numeric>
                  {rule.kind === 'fixed-monthly'
                    ? formatMad(rule.amountMad, i18n.language)
                    : formatPercent(rule.percent, i18n.language)}
                </Numeric>
              </DataTableCell>
              <DataTableCell>
                {formatMonth(rule.startMonth, i18n.language)}
                {' – '}
                {rule.endMonth ? formatMonth(rule.endMonth, i18n.language) : t('teachers.detail.payroll.active.title')}
              </DataTableCell>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
