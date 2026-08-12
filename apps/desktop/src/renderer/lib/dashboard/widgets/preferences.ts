import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGETS_BY_ID,
  type AdvancedWidgetId,
  type BasicWidgetId,
  type DashboardWidgetId,
  type DashboardWidgetPanel,
} from './registry';

export type DashboardWidgetPreference = {
  readonly widgetId: DashboardWidgetId;
  readonly visible: boolean;
};

export type BasicWidgetPreference = {
  readonly widgetId: BasicWidgetId;
  readonly visible: boolean;
};

export type AdvancedWidgetPreference = {
  readonly widgetId: AdvancedWidgetId;
  readonly visible: boolean;
};

/**
 * The persisted shape: a flat array whose position is the widget's order,
 * exactly the `{widgetId, visible, order}[]` KICKOFF asked for. `null` means
 * "never touched" — the panels and checklist fall back to registry defaults
 * (all widgets visible, in mockup order) instead of materializing a row.
 */
export type StoredWidgetPreferences = DashboardWidgetPreference[] | null;

/**
 * Merge the stored preferences with the registry, returning a complete,
 * ordered list of every widget in the registry. Stored entries keep their
 * stored order; registry widgets the stored list doesn't know about (fresh
 * install, or a widget added in a later version) are appended, visible.
 */
export function resolveAllWidgets(stored: StoredWidgetPreferences): DashboardWidgetPreference[] {
  const result: DashboardWidgetPreference[] = [];
  const seen = new Set<DashboardWidgetId>();
  if (stored !== null) {
    for (const preference of stored) {
      if (DASHBOARD_WIDGETS_BY_ID.has(preference.widgetId) && !seen.has(preference.widgetId)) {
        result.push(preference);
        seen.add(preference.widgetId);
      }
    }
  }
  for (const definition of DASHBOARD_WIDGETS) {
    if (!seen.has(definition.id)) {
      result.push({ widgetId: definition.id, visible: true });
    }
  }
  return result;
}

export function resolvePanelWidgets(panel: 'basic', stored: StoredWidgetPreferences): BasicWidgetPreference[];
export function resolvePanelWidgets(
  panel: 'advanced',
  stored: StoredWidgetPreferences,
): AdvancedWidgetPreference[];
/** The effective widget list for one dashboard panel, in display order. */
export function resolvePanelWidgets(panel: DashboardWidgetPanel, stored: StoredWidgetPreferences) {
  return resolveAllWidgets(stored).filter(
    (preference) => DASHBOARD_WIDGETS_BY_ID.get(preference.widgetId)?.panel === panel,
  );
}

/** Toggle `widgetId`'s visibility, preserving the rest of the preferences. */
export function applyWidgetVisibility(
  stored: StoredWidgetPreferences,
  widgetId: DashboardWidgetId,
  visible: boolean,
): StoredWidgetPreferences {
  return resolveAllWidgets(stored).map((preference) =>
    preference.widgetId === widgetId ? { ...preference, visible } : preference,
  );
}

/**
 * Swap `widgetId` with its neighbour `delta` positions away **within the same
 * panel** (delta = -1 up / +1 down). Moving never crosses a panel boundary, so
 * a widget cannot be dragged into the other dashboard's list.
 */
export function applyWidgetMove(
  stored: StoredWidgetPreferences,
  widgetId: DashboardWidgetId,
  delta: -1 | 1,
): StoredWidgetPreferences {
  const all = resolveAllWidgets(stored);
  const index = all.findIndex((preference) => preference.widgetId === widgetId);
  const panel = DASHBOARD_WIDGETS_BY_ID.get(widgetId)?.panel;
  if (index === -1 || panel === undefined) {
    return stored;
  }
  let target = index + delta;
  while (target >= 0 && target < all.length && DASHBOARD_WIDGETS_BY_ID.get(all[target]!.widgetId)?.panel !== panel) {
    target += delta;
  }
  if (target < 0 || target >= all.length) {
    return stored;
  }
  const next = [...all];
  [next[index]!, next[target]!] = [next[target]!, next[index]!];
  return next;
}
