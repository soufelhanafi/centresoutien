import { useTranslation } from 'react-i18next';
import { HandCoins } from 'lucide-react';
import { Badge, Button, EmptyState } from '@centresoutien/ui';
import type { TeacherPayrollRuleView } from '../../lib/teacher-payroll-rules/teacher-payroll-rule-view';
import { formatMad } from '../../lib/formulas/price-mad';
import { formatMonth, formatPercent } from '../../lib/format';

const kindLabelKey = (kind: TeacherPayrollRuleView['kind']) =>
  kind === 'fixed-monthly' ? 'fixedMonthly' : 'percentageOfMonthlyFees';

/**
 * The teacher's current live payroll rule, or the empty state prompting the
 * first one. `onChange` opens the same dialog either way — the dialog itself
 * decides plain create vs. close-and-reopen from whether a rule is passed.
 */
export function TeacherPayrollRuleActiveCard({
  rule,
  onChange,
}: {
  rule: TeacherPayrollRuleView | null;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();

  if (rule === null) {
    return (
      <EmptyState
        icon={<HandCoins className="h-5 w-5" aria-hidden="true" />}
        title={t('teachers.detail.payroll.active.empty.title')}
        description={t('teachers.detail.payroll.active.empty.body')}
        action={
          <Button size="sm" onClick={onChange}>
            {t('teachers.detail.payroll.active.empty.cta')}
          </Button>
        }
      />
    );
  }

  const amountLabel =
    rule.kind === 'fixed-monthly'
      ? t('teachers.detail.payroll.active.fixedAmount')
      : t('teachers.detail.payroll.active.percentageAmount');
  const amountValue =
    rule.kind === 'fixed-monthly' ? formatMad(rule.amountMad, i18n.language) : formatPercent(rule.percent, i18n.language);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('teachers.detail.payroll.active.title')}</h2>
            <Badge>{t(`teachers.detail.payroll.kind.${kindLabelKey(rule.kind)}`)}</Badge>
          </div>
          <p className="text-lg font-semibold text-foreground">{amountValue}</p>
          <p className="text-xs text-muted-foreground">{amountLabel}</p>
          <p className="text-xs text-muted-foreground">
            {t('teachers.detail.payroll.active.since', { month: formatMonth(rule.startMonth, i18n.language) })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onChange}>
          {t('teachers.detail.payroll.active.change')}
        </Button>
      </div>
    </div>
  );
}
