import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DashboardView = 'basic' | 'advanced';

type DashboardViewState = {
  view: DashboardView;
  setView: (view: DashboardView) => void;
  reset: () => void;
};

/**
 * Local, device-scoped admin preference — no multi-user identity system exists
 * (CLAUDE.md §4), so this is pure Presentation-layer state. Persisted to
 * localStorage so the toggle survives an app restart.
 */
export const useDashboardViewStore = create<DashboardViewState>()(
  persist(
    (set) => ({
      view: 'basic',
      setView: (view) => set({ view }),
      // 'advanced' is Premium-gated; a center switch may land on a plan without it,
      // so reset to the always-available 'basic' view to avoid a stale selection.
      reset: () => set({ view: 'basic' }),
    }),
    { name: 'centre-soutien.dashboard-view' },
  ),
);
