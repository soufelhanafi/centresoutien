import { useTranslation } from 'react-i18next';
import { Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@centresoutien/ui';
import { resolvePanelWidgets } from '../../../lib/dashboard/widgets/preferences';
import type { DashboardWidgetPanel } from '../../../lib/dashboard/widgets/registry';
import { useDashboardWidgetsStore } from '../../../stores/dashboard-widgets-store';
import { DashboardWidgetConfigRow } from './dashboard-widget-config-row';

const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

type DashboardCustomizeSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PANEL_SECTIONS: ReadonlyArray<{ panel: DashboardWidgetPanel; headingKey: string }> = [
  { panel: 'basic', headingKey: 'dashboard.widgets.panelBasic' },
  { panel: 'advanced', headingKey: 'dashboard.widgets.panelAdvanced' },
];

/**
 * The widget show/hide + reorder panel (SOU-231). Toggling applies instantly
 * (the panels read the same store), persists to localStorage, and survives a
 * restart + center switch. Reordering uses up/down arrows — no drag-and-drop
 * quirk to leak through RTL.
 */
export function DashboardCustomizeSheet({ open, onOpenChange }: DashboardCustomizeSheetProps) {
  const { t } = useTranslation();
  const stored = useDashboardWidgetsStore((state) => state.prefs);
  const reset = useDashboardWidgetsStore((state) => state.reset);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('dashboard.widgets.close')} className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('dashboard.widgets.title')}</SheetTitle>
          <SheetDescription>{t('dashboard.widgets.description')}</SheetDescription>
        </SheetHeader>

        <div className="-mx-1 flex-1 space-y-5 overflow-y-auto px-1 py-4">
          {PANEL_SECTIONS.map(({ panel, headingKey }) => {
            const widgets =
              panel === 'basic'
                ? resolvePanelWidgets('basic', stored)
                : resolvePanelWidgets('advanced', stored);
            return (
              <section key={panel} aria-labelledby={`dashboard-widget-config-${panel}`}>
                <h2 id={`dashboard-widget-config-${panel}`} className={SECTION_LABEL}>
                  {t(headingKey)}
                </h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {widgets.map((widget, index) => (
                    <DashboardWidgetConfigRow
                      key={widget.widgetId}
                      widgetId={widget.widgetId}
                      visible={widget.visible}
                      isFirst={index === 0}
                      isLast={index === widgets.length - 1}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={reset}>
            {t('dashboard.widgets.reset')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
