import type { DashboardWidgetPanel } from '../../lib/dashboard/widgets/registry';

/**
 * Grid col-span class for a widget's footprint, per panel. Reordering (SOU-231)
 * changes a widget's position, never its size — the footprint is a property of
 * the widget. Basique rows are a 3-column grid (`lg:grid-cols-3`), Avancé a
 * 2-column grid (`sm:grid-cols-2`).
 */
export const WIDGET_SPAN_CLASS: Readonly<
  Record<DashboardWidgetPanel, Readonly<Record<'full' | 'single', string>>>
> = {
  basic: { full: 'lg:col-span-3', single: 'lg:col-span-1' },
  advanced: { full: 'sm:col-span-2', single: 'sm:col-span-1' },
};
