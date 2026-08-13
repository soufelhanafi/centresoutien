import { useTranslation } from 'react-i18next';
import { Cloud } from 'lucide-react';
import { EmptyState, LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { DashboardConsolidatedPreview } from './dashboard-consolidated-preview';

/*
 * The Consolidé (multi-centres) dashboard pane (SOU-105).
 *
 * Cross-center consolidation is a cloud-only feature (CLAUDE.md §5ter, SOU-96):
 * the desktop never merges data across per-center DBs, so this tab is an upsell /
 * link-out surface, never a live aggregation.
 * - Without `org.multi-center`: the upgrade lock over a blurred preview.
 * - With `org.multi-center`: the flag is granted, but the aggregation still lives
 *   in the web app, so we point users there instead of faking data.
 */
export function DashboardConsolidatedPanel() {
  const { t } = useTranslation();
  const hasMultiCenter = useFeature('org.multi-center');
  const upgradeCta = useUpgradeCta('org.multi-center');

  if (hasMultiCenter) {
    return (
      <EmptyState
        icon={<Cloud className="h-5 w-5" aria-hidden="true" />}
        title={t('dashboard.consolidated.cloud.title')}
        description={t('dashboard.consolidated.cloud.body')}
        className="mx-auto max-w-md"
      />
    );
  }

  return (
    <LockOverlay
      title={t('dashboard.consolidated.lock.title')}
      description={t('plan.locked')}
      ctaLabel={upgradeCta.ctaLabel}
      onCta={upgradeCta.onCta}
    >
      <div className="p-4">
        <DashboardConsolidatedPreview />
      </div>
    </LockOverlay>
  );
}
