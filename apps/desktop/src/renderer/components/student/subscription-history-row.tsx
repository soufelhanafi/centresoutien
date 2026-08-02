import { useTranslation } from 'react-i18next';
import type { GroupKind } from '@centresoutien/domain';
import { DataTableCell, DataTableRow, KindBadge } from '@centresoutien/ui';
import { formatMonth } from '../../lib/format';
import type { FormulaView } from '../../lib/formulas/formula-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import { resolveSubscriptionLabel } from '../../lib/subscriptions/subscription-label';
import type { SubscriptionView } from '../../lib/subscriptions/subscription-view';

const kindLabelKey = (kind: GroupKind) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/** One closed subscription: kind badge, resolved formula/subject label, period. */
export function SubscriptionHistoryRow({
  subscription,
  formulas,
  subjects,
}: {
  subscription: SubscriptionView;
  formulas: readonly FormulaView[];
  subjects: readonly SubjectView[];
}) {
  const { t, i18n } = useTranslation();
  const label = resolveSubscriptionLabel(subscription, formulas, subjects, i18n.language);
  const start = formatMonth(subscription.startMonth, i18n.language);
  const period = subscription.endMonth
    ? `${start} – ${formatMonth(subscription.endMonth, i18n.language)}`
    : t('students.subscription.history.since', { month: start });

  return (
    <DataTableRow>
      <DataTableCell>
        <KindBadge kind={subscription.kind} label={t(`groups.kind.${kindLabelKey(subscription.kind)}`)} />
      </DataTableCell>
      <DataTableCell className="font-medium text-foreground">{label.text}</DataTableCell>
      <DataTableCell className="text-muted-foreground">{period}</DataTableCell>
    </DataTableRow>
  );
}
