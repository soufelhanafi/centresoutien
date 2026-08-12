import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { useDashboardViewStore, type DashboardView } from '../../stores/dashboard-view-store';
import { DashboardBasicPanel } from '../../components/dashboard/dashboard-basic-panel';
import { DashboardAdvancedPanel } from '../../components/dashboard/dashboard-advanced-panel';
import { DashboardCustomizeSheet } from '../../components/dashboard/dashboard-widget-config/dashboard-customize-sheet';
import { DashboardCustomizeTrigger } from '../../components/dashboard/dashboard-widget-config/dashboard-customize-trigger';

/**
 * Dashboard shell (SOU-59) + KPI widgets (SOU-100) + per-widget show/hide +
 * reorder config (SOU-231). The Basique / Avancé toggle persists per device;
 * the widget config lives per device too and is plan-aware — gating is enforced
 * per widget inside the panels (via `useFeature`), never here.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);

  return (
    <section aria-labelledby="dashboard-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 id="dashboard-title" className="text-xl font-semibold text-foreground">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <DashboardCustomizeTrigger onClick={() => setCustomizeOpen(true)} />
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
          <DashboardAdvancedPanel />
        </TabsContent>
      </Tabs>

      <DashboardCustomizeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} />
    </section>
  );
}
