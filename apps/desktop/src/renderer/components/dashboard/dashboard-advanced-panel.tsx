import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import { Button, ErrorState, LockOverlay, Skeleton, cn } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useDashboardAdvancedSummary } from '../../hooks/dashboard/use-dashboard-advanced-summary';
import { DASHBOARD_WIDGETS_BY_ID } from '../../lib/dashboard/widgets/registry';
import { resolvePanelWidgets } from '../../lib/dashboard/widgets/preferences';
import { useDashboardWidgetsStore } from '../../stores/dashboard-widgets-store';
import { ADVANCED_WIDGET_CONTENT } from './dashboard-widget-content';
import { WIDGET_SPAN_CLASS } from './dashboard-widget-span';
import { DashboardWidgetsHidden } from './dashboard-widgets-hidden';

const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';
const WIDGET_CARD = 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4';

/**
 * The Avancé dashboard pane (SOU-100/231). Gating is now per widget, not per
 * pane: when `dashboard.advanced` is unavailable each configured widget renders
 * its LockOverlay + upgrade CTA in place (SOU-231 KICKOFF §3) — the config can
 * show/hide any widget, it can never unlock one.
 */
export function DashboardAdvancedPanel() {
  const { t } = useTranslation();
  const canViewAdvanced = useFeature('dashboard.advanced');
  const upgradeCta = useUpgradeCta('dashboard.advanced');
  const query = useDashboardAdvancedSummary(canViewAdvanced);
  const stored = useDashboardWidgetsStore((state) => state.prefs);
  const widgets = resolvePanelWidgets('advanced', stored).filter((widget) => widget.visible);

  if (canViewAdvanced && query.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2" aria-busy="true">
        {widgets.map((widget) => (
          <Skeleton
            key={widget.widgetId}
            className={`h-52 w-full rounded-xl ${WIDGET_SPAN_CLASS.advanced[DASHBOARD_WIDGETS_BY_ID.get(widget.widgetId)!.span]}`}
          />
        ))}
      </div>
    );
  }

  if (canViewAdvanced && query.isError) {
    return (
      <ErrorState
        icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
        title={t('dashboard.advanced.loadError.title')}
        description={t('dashboard.advanced.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('dashboard.advanced.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (widgets.length === 0) {
    return <DashboardWidgetsHidden />;
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {widgets.map((widget) => {
        const definition = DASHBOARD_WIDGETS_BY_ID.get(widget.widgetId)!;
        const spanClass = WIDGET_SPAN_CLASS.advanced[definition.span];
        if (canViewAdvanced && query.data) {
          return (
            <div key={widget.widgetId} className={cn(WIDGET_CARD, spanClass)}>
              <p className={SECTION_LABEL}>{t(definition.labelKey)}</p>
              {ADVANCED_WIDGET_CONTENT[widget.widgetId](query.data)}
            </div>
          );
        }
        return (
          <LockOverlay
            key={widget.widgetId}
            title={t(definition.labelKey)}
            description={t('plan.locked')}
            ctaLabel={upgradeCta.ctaLabel}
            onCta={upgradeCta.onCta}
            className={spanClass}
          >
            <div className="h-52" />
          </LockOverlay>
        );
      })}
    </div>
  );
}
