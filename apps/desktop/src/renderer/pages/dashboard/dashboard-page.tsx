import { useTranslation } from 'react-i18next';
import { LayoutDashboard } from 'lucide-react';
import { EmptyState, LockOverlay, Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useDashboardViewStore, type DashboardView } from '../../stores/dashboard-view-store';

/**
 * Dashboard shell (SOU-59): Basique / Avancé toggle, preference persisted
 * per device. Both panes are placeholder slots — the real KPI widgets land in
 * SOU-100. The toggle itself is never plan-gated; only the Advanced pane's
 * content is, via `useFeature('dashboard.advanced')`.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);
  const canViewAdvanced = useFeature('dashboard.advanced');

  const placeholder = (
    <EmptyState
      icon={<LayoutDashboard className="h-5 w-5" aria-hidden="true" />}
      title={t('shell.placeholder.title')}
      description={t('shell.placeholder.body')}
    />
  );

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
          {placeholder}
        </TabsContent>
        <TabsContent value="advanced" className="mt-4">
          {canViewAdvanced ? (
            placeholder
          ) : (
            <LockOverlay title={t('dashboard.tabs.advanced')} description={t('plan.locked')} ctaLabel={t('plan.viewPlans')}>
              <div className="p-8">{placeholder}</div>
            </LockOverlay>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
