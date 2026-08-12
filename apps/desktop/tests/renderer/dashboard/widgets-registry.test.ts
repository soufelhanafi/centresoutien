import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_WIDGETS,
  type AdvancedWidgetId,
  type BasicWidgetId,
  type DashboardWidgetId,
} from '../../../src/renderer/lib/dashboard/widgets/registry';
import {
  applyWidgetMove,
  applyWidgetVisibility,
  resolveAllWidgets,
  resolvePanelWidgets,
} from '../../../src/renderer/lib/dashboard/widgets/preferences';

const BASIC_ORDER: readonly BasicWidgetId[] = ['argent', 'effectifs', 'teacher-load', 'seances', 'quick-actions'];
const ADVANCED_ORDER: readonly AdvancedWidgetId[] = [
  'revenue-trend',
  'enrollment-evolution',
  'attendance-rate',
  'subject-breakdown',
  'enrollment-activity',
  'attendance-heatmap',
];

function stored(
  ids: readonly DashboardWidgetId[],
  visible = true,
): { widgetId: DashboardWidgetId; visible: boolean }[] {
  return ids.map((widgetId) => ({ widgetId, visible }));
}

describe('DASHBOARD_WIDGETS registry (SOU-231 KICKOFF set)', () => {
  it('declares the eleven widgets in the current mockup order', () => {
    expect(DASHBOARD_WIDGETS.map((widget) => widget.id)).toEqual([...BASIC_ORDER, ...ADVANCED_ORDER]);
  });

  it('ships every Basique widget ungated and every Avancé widget gated by dashboard.advanced', () => {
    const basic = DASHBOARD_WIDGETS.filter((widget) => widget.panel === 'basic');
    const advanced = DASHBOARD_WIDGETS.filter((widget) => widget.panel === 'advanced');
    expect(basic.every((widget) => widget.feature === undefined)).toBe(true);
    expect(advanced.every((widget) => widget.feature === 'dashboard.advanced')).toBe(true);
  });

  it('keeps quick-actions a widget like the data widgets, and spans match the mockups', () => {
    const quickActions = DASHBOARD_WIDGETS.find((widget) => widget.id === 'quick-actions');
    expect(quickActions?.panel).toBe('basic');
    // Argent and quick-actions span the whole row; the three Basique cards and
    // every Avancé card except the heatmap are single cells.
    expect(DASHBOARD_WIDGETS.find((widget) => widget.id === 'argent')?.span).toBe('full');
    expect(DASHBOARD_WIDGETS.find((widget) => widget.id === 'attendance-heatmap')?.span).toBe('full');
    expect(quickActions?.span).toBe('full');
  });
});

describe('resolvePanelWidgets / resolveAllWidgets', () => {
  it('falls back to registry defaults (all visible, mockup order) on a fresh install', () => {
    expect(resolveAllWidgets(null)).toEqual([
      ...BASIC_ORDER.map((widgetId) => ({ widgetId, visible: true })),
      ...ADVANCED_ORDER.map((widgetId) => ({ widgetId, visible: true })),
    ]);
    expect(resolvePanelWidgets('basic', null).map((widget) => widget.widgetId)).toEqual(BASIC_ORDER);
    expect(resolvePanelWidgets('advanced', null).map((widget) => widget.widgetId)).toEqual(ADVANCED_ORDER);
  });

  it('honours the stored order and appends registry widgets the stored list misses, visible', () => {
    const prefs = stored(['seances', 'effectifs', 'argent']);
    const resolved = resolveAllWidgets(prefs);
    expect(resolved.map((widget) => widget.widgetId)).toEqual([
      'seances',
      'effectifs',
      'argent',
      'teacher-load',
      'quick-actions',
      ...ADVANCED_ORDER,
    ]);
    expect(resolved.find((widget) => widget.widgetId === 'teacher-load')?.visible).toBe(true);
  });

  it('drops stored widget ids that are no longer in the registry', () => {
    const resolved = resolveAllWidgets(stored(['argent', 'ghost-widget' as DashboardWidgetId]));
    expect(resolved.some((widget) => widget.widgetId === 'ghost-widget')).toBe(false);
    expect(resolved[0]?.widgetId).toBe('argent');
  });

  it('never mixes the two panels: resolving basic returns only basic widgets', () => {
    const resolved = resolvePanelWidgets('basic', stored(['revenue-trend', 'effectifs', 'seances']));
    expect(resolved.map((widget) => widget.widgetId)).toEqual(['effectifs', 'seances', 'argent', 'teacher-load', 'quick-actions']);
  });
});

describe('applyWidgetVisibility', () => {
  it('flips one widget and preserves order and the other entries', () => {
    const prefs = stored(['argent', 'effectifs', 'seances'], true);
    const next = applyWidgetVisibility(prefs, 'effectifs', false);
    expect(next).toEqual([
      { widgetId: 'argent', visible: true },
      { widgetId: 'effectifs', visible: false },
      { widgetId: 'seances', visible: true },
      { widgetId: 'teacher-load', visible: true },
      { widgetId: 'quick-actions', visible: true },
      ...ADVANCED_ORDER.map((widgetId) => ({ widgetId, visible: true })),
    ]);
  });

  it('materialises defaults (null) into an explicit array on the first change', () => {
    const next = applyWidgetVisibility(null, 'argent', false);
    expect(next).not.toBeNull();
    expect(next.find((widget) => widget.widgetId === 'argent')?.visible).toBe(false);
    expect(next).toHaveLength(DASHBOARD_WIDGETS.length);
  });
});

describe('applyWidgetMove', () => {
  it('swaps neighbours within the same panel', () => {
    const next = applyWidgetMove(null, 'teacher-load', -1);
    expect(next.map((widget) => widget.widgetId)).toEqual([
      'argent',
      'teacher-load',
      'effectifs',
      'seances',
      'quick-actions',
      ...ADVANCED_ORDER,
    ]);
  });

  it('is a no-op at the top and bottom edges of the panel list', () => {
    expect(applyWidgetMove(null, 'argent', -1)).toBeNull();
    expect(applyWidgetMove(null, 'quick-actions', 1)).toBeNull();
  });

  it('never moves a widget across panel boundaries', () => {
    // quick-actions is the last Basique widget and revenue-trend the first
    // Avancé one — neither can be dragged into the other dashboard's block.
    expect(applyWidgetMove(null, 'quick-actions', 1)).toBeNull();
    expect(applyWidgetMove(null, 'revenue-trend', -1)).toBeNull();
  });
});
