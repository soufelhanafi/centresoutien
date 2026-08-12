// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useDashboardWidgetsStore } from '../../../src/renderer/stores/dashboard-widgets-store';
import { resolvePanelWidgets } from '../../../src/renderer/lib/dashboard/widgets/preferences';

const STORAGE_KEY = 'centre-soutien.dashboard-widgets';

function persisted(): { widgetId: string; visible: boolean }[] | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as { state: { prefs: { widgetId: string; visible: boolean }[] | null } };
  return parsed.state.prefs;
}

beforeEach(() => {
  localStorage.clear();
  useDashboardWidgetsStore.setState({ prefs: null });
});

describe('useDashboardWidgetsStore (SOU-231)', () => {
  it('starts untouched (null) so panels resolve to registry defaults', () => {
    expect(useDashboardWidgetsStore.getState().prefs).toBeNull();
  });

  it('toggles a widget, persists to localStorage under centre-soutien.dashboard-widgets', () => {
    useDashboardWidgetsStore.getState().setVisible('seances', false);

    const prefs = useDashboardWidgetsStore.getState().prefs;
    expect(prefs?.find((preference) => preference.widgetId === 'seances')?.visible).toBe(false);
    expect(prefs?.find((preference) => preference.widgetId === 'effectifs')?.visible).toBe(true);
    expect(persisted()).toEqual(prefs);
  });

  it('reorders widgets and persists the new order', () => {
    useDashboardWidgetsStore.getState().move('teacher-load', -1);

    const order = resolvePanelWidgets('basic', useDashboardWidgetsStore.getState().prefs).map(
      (widget) => widget.widgetId,
    );
    expect(order).toEqual(['argent', 'teacher-load', 'effectifs', 'seances', 'quick-actions']);
    expect(persisted()).toEqual(useDashboardWidgetsStore.getState().prefs);
  });

  it('reset clears the customisation back to defaults', () => {
    useDashboardWidgetsStore.getState().setVisible('argent', false);
    useDashboardWidgetsStore.getState().reset();

    expect(useDashboardWidgetsStore.getState().prefs).toBeNull();
    expect(persisted()).toBeNull();
  });
});
