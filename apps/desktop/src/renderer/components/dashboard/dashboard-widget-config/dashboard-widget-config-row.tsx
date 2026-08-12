import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button, Checkbox, PlanBadge } from '@centresoutien/ui';
import { minimumPlanFor } from '../../../lib/plan/minimum-plan';
import { DASHBOARD_WIDGETS_BY_ID, type DashboardWidgetId } from '../../../lib/dashboard/widgets/registry';
import { useDashboardWidgetsStore } from '../../../stores/dashboard-widgets-store';

type DashboardWidgetConfigRowProps = {
  widgetId: DashboardWidgetId;
  visible: boolean;
  /** First/last in its panel's full list — the reorder button is disabled at the edge. */
  isFirst: boolean;
  isLast: boolean;
};

/**
 * One checklist row of the customize sheet: a show/hide checkbox, the widget's
 * name (with its plan badge when gated), and RTL-safe up/down reorder buttons.
 * Up/down are vertical, so they need no mirroring under RTL (SOU-231 §5).
 */
export function DashboardWidgetConfigRow({ widgetId, visible, isFirst, isLast }: DashboardWidgetConfigRowProps) {
  const { t } = useTranslation();
  const setVisible = useDashboardWidgetsStore((state) => state.setVisible);
  const move = useDashboardWidgetsStore((state) => state.move);
  const definition = DASHBOARD_WIDGETS_BY_ID.get(widgetId);
  if (definition === undefined) {
    return null;
  }
  const label = t(definition.labelKey);

  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5">
      <Checkbox
        checked={visible}
        onCheckedChange={(checked) => setVisible(widgetId, checked === true)}
        aria-label={visible ? t('dashboard.widgets.hide', { widget: label }) : t('dashboard.widgets.show', { widget: label })}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
      {definition.feature !== undefined ? (
        <PlanBadge tier={minimumPlanFor(definition.feature)} className="shrink-0" />
      ) : null}
      <span className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isFirst}
          onClick={() => move(widgetId, -1)}
          aria-label={t('dashboard.widgets.moveUp', { widget: label })}
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isLast}
          onClick={() => move(widgetId, 1)}
          aria-label={t('dashboard.widgets.moveDown', { widget: label })}
        >
          <ArrowDown className="size-4" aria-hidden="true" />
        </Button>
      </span>
    </li>
  );
}
