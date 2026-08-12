import { useTranslation } from 'react-i18next';
import { LayoutDashboard } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '@centresoutien/ui';
import { useDashboardBasicSummary } from '../../hooks/dashboard/use-dashboard-basic-summary';
import { DASHBOARD_WIDGETS_BY_ID } from '../../lib/dashboard/widgets/registry';
import { resolvePanelWidgets } from '../../lib/dashboard/widgets/preferences';
import { useDashboardWidgetsStore } from '../../stores/dashboard-widgets-store';
import { BASIC_WIDGET_CONTENT } from './dashboard-widget-content';
import { WIDGET_SPAN_CLASS } from './dashboard-widget-span';
import { DashboardWidgetsHidden } from './dashboard-widgets-hidden';

/** The Basique dashboard pane (SOU-177/231): widgets render in the per-device order. */
export function DashboardBasicPanel() {
  const { t } = useTranslation();
  const query = useDashboardBasicSummary();
  const stored = useDashboardWidgetsStore((state) => state.prefs);
  const widgets = resolvePanelWidgets('basic', stored).filter((widget) => widget.visible);

  if (query.isPending) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" aria-busy="true">
        {widgets.map((widget) => (
          <Skeleton
            key={widget.widgetId}
            className={`h-40 w-full rounded-xl ${WIDGET_SPAN_CLASS.basic[DASHBOARD_WIDGETS_BY_ID.get(widget.widgetId)!.span]}`}
          />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        icon={<LayoutDashboard className="h-5 w-5" aria-hidden="true" />}
        title={t('dashboard.basic.loadError.title')}
        description={t('dashboard.basic.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('dashboard.basic.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (widgets.length === 0) {
    return <DashboardWidgetsHidden />;
  }

  const summary = query.data;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {widgets.map((widget) => {
        const definition = DASHBOARD_WIDGETS_BY_ID.get(widget.widgetId)!;
        return (
          <div key={widget.widgetId} className={WIDGET_SPAN_CLASS.basic[definition.span]}>
            {BASIC_WIDGET_CONTENT[widget.widgetId](summary)}
          </div>
        );
      })}
    </div>
  );
}
