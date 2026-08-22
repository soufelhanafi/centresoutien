import { useTranslation } from 'react-i18next';
import { LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { MultiCenterStatsPanel } from '../../components/multi-center-stats/multi-center-stats-panel';
import { MultiCenterStatsPreview } from '../../components/multi-center-stats/multi-center-stats-preview';

/**
 * Per-center stats page (SOU-106, Premium `org.multi-center`). A REAL read-only
 * local aggregation across the operator's installed centers — a deliberate,
 * documented override of CLAUDE.md §5ter for this Premium feature; the isolation
 * guarantee still holds since each center DB is read on its own in main.
 *
 * Non-Premium → the upgrade lock over a blurred preview. Premium → the live panel.
 */
export function MultiCenterStatsPage() {
  const { t, i18n } = useTranslation();
  const hasMultiCenter = useFeature('org.multi-center');
  const upgradeCta = useUpgradeCta('org.multi-center');
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';

  return (
    <section aria-labelledby="multi-center-stats-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="multi-center-stats-title" className="text-xl font-semibold text-foreground">
          {t('multiCenterStats.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('multiCenterStats.subtitle')}</p>
      </header>

      {hasMultiCenter ? (
        <MultiCenterStatsPanel locale={locale} />
      ) : (
        <LockOverlay
          title={t('multiCenterStats.lock.title')}
          description={t('plan.locked')}
          ctaLabel={upgradeCta.ctaLabel}
          onCta={upgradeCta.onCta}
        >
          <MultiCenterStatsPreview />
        </LockOverlay>
      )}
    </section>
  );
}
