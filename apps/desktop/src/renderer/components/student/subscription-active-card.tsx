import { useTranslation } from 'react-i18next';
import type { GroupKind } from '@centresoutien/domain';
import { Button, Card, CardContent, CardHeader, CardTitle, KindBadge } from '@centresoutien/ui';
import { formatMonth, formatMoneyMad } from '../../lib/format';
import type { FormulaView } from '../../lib/formulas/formula-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import { resolveSubscriptionLabel } from '../../lib/subscriptions/subscription-label';
import type { SubscriptionView } from '../../lib/subscriptions/subscription-view';

const kindLabelKey = (kind: GroupKind) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/** One track's Active slot: the live subscription (or an empty "subscribe" prompt). */
export function SubscriptionActiveCard({
  kind,
  subscription,
  formulas,
  subjects,
  onManage,
}: {
  kind: GroupKind;
  subscription: SubscriptionView | null;
  formulas: readonly FormulaView[];
  subjects: readonly SubjectView[];
  onManage: () => void;
}) {
  const { t, i18n } = useTranslation();
  const label = subscription
    ? resolveSubscriptionLabel(subscription, formulas, subjects, i18n.language)
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">{t(`groups.kind.${kindLabelKey(kind)}`)}</CardTitle>
          <KindBadge kind={kind} label={t(`groups.kind.${kindLabelKey(kind)}`)} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onManage}>
          {subscription
            ? t('students.subscription.active.changeCta')
            : t('students.subscription.active.subscribeCta')}
        </Button>
      </CardHeader>
      <CardContent>
        {subscription && label ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <p className="font-medium text-foreground">{label.text}</p>
              {label.priceMad !== null && (
                <p className="text-sm text-muted-foreground">
                  {formatMoneyMad(label.priceMad, i18n.language)}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('students.subscription.active.since', { month: formatMonth(subscription.startMonth, i18n.language) })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('students.subscription.active.empty')}</p>
        )}
      </CardContent>
    </Card>
  );
}
