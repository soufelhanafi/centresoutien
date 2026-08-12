import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardWidgetId } from '../lib/dashboard/widgets/registry';
import {
  applyWidgetMove,
  applyWidgetVisibility,
  type StoredWidgetPreferences,
} from '../lib/dashboard/widgets/preferences';

type DashboardWidgetsState = {
  /**
   * `null` = the admin never touched the config: panels resolve to registry
   * defaults (all visible, mockup order) without materializing a row.
   */
  prefs: StoredWidgetPreferences;
  setVisible: (widgetId: DashboardWidgetId, visible: boolean) => void;
  move: (widgetId: DashboardWidgetId, delta: -1 | 1) => void;
  reset: () => void;
};

/**
 * Per-admin (= per-device, no multi-user identity exists) dashboard widget
 * config (SOU-231). Reuses the SOU-59 `dashboard-view-store` pattern: zustand
 * `persist` → localStorage, so the choice survives an app restart AND a center
 * switch (SOU-96) — unlike the view toggle, widget prefs intentionally do NOT
 * reset when the center changes (CLAUDE.md §5ter / KICKOFF: survives switch).
 * Pure Presentation-layer state; no domain entity, no IPC, no sync.
 */
export const useDashboardWidgetsStore = create<DashboardWidgetsState>()(
  persist(
    (set) => ({
      prefs: null,
      setVisible: (widgetId, visible) =>
        set((state) => ({ prefs: applyWidgetVisibility(state.prefs, widgetId, visible) })),
      move: (widgetId, delta) => set((state) => ({ prefs: applyWidgetMove(state.prefs, widgetId, delta) })),
      reset: () => set({ prefs: null }),
    }),
    { name: 'centre-soutien.dashboard-widgets' },
  ),
);
