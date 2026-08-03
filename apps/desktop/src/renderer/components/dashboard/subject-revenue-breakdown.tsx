import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';
import { formatMoneyMad } from '../../lib/format';
import { localizedSubjectName } from '../../lib/subjects/localized-name';
import type { SubjectRevenueShareView } from '../../lib/dashboard/dashboard-view';

/** Avancé widget: current month's collected revenue split by subject, highest first. */
export function SubjectRevenueBreakdown({ shares }: { shares: readonly SubjectRevenueShareView[] }) {
  const { t, i18n } = useTranslation();

  if (shares.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('dashboard.advanced.subjectBreakdown.empty')}</p>;
  }

  const maxAmountMad = Math.max(...shares.map((share) => share.amountMad));

  return (
    <ul className="flex flex-col gap-2.5">
      {shares.map((share) => (
        <li key={share.subjectId} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-2.5 text-xs">
          <span className="truncate font-medium text-foreground">
            {localizedSubjectName(share.subjectName, i18n.language)}
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ inlineSize: `${maxAmountMad > 0 ? (share.amountMad / maxAmountMad) * 100 : 0}%` }}
            />
          </div>
          <Numeric>{formatMoneyMad(share.amountMad, i18n.language)}</Numeric>
        </li>
      ))}
    </ul>
  );
}
