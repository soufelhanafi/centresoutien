import { useTranslation } from 'react-i18next';
import { LockOverlay, Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useDashboardViewStore, type DashboardView } from '../../stores/dashboard-view-store';
import { DashboardBasicPanel } from '../../components/dashboard/dashboard-basic-panel';
import { DashboardAdvancedPanel } from '../../components/dashboard/dashboard-advanced-panel';

/**
 * Dashboard shell (SOU-59) + KPI widgets (SOU-100): Basique / Avancé toggle,
 * preference persisted per device. The toggle itself is never plan-gated;
 * only the Advanced pane's content is, via `useFeature('dashboard.advanced')`.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);
  const canViewAdvanced = useFeature('dashboard.advanced');
  const upgradeCta = useUpgradeCta('dashboard.advanced');

  return (
    <section aria-labelledby="dashboard-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="dashboard-title" className="text-xl font-semibold text-foreground">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
      </header>

      <Tabs value={view} onValueChange={(value) => setView(value as DashboardView)}>
        <TabsList>
          <TabsTrigger value="basic">{t('dashboard.tabs.basic')}</TabsTrigger>
          <TabsTrigger value="advanced">{t('dashboard.tabs.advanced')}</TabsTrigger>
        </TabsList>
        <TabsContent value="basic" className="mt-4">
          <DashboardBasicPanel />
        </TabsContent>
        <TabsContent value="advanced" className="mt-4">
          {canViewAdvanced ? (
            <DashboardAdvancedPanel />
          ) : (
            <LockOverlay
              title={t('dashboard.tabs.advanced')}
              description={t('plan.locked')}
              ctaLabel={upgradeCta.ctaLabel}
              onCta={upgradeCta.onCta}
            >
              <div className="p-8 text-sm text-muted-foreground">{t('dashboard.advanced.lockedBody')}</div>
            </LockOverlay>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
