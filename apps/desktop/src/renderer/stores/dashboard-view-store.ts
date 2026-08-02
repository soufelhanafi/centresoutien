import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DashboardView = 'basic' | 'advanced';

type DashboardViewState = {
  view: DashboardView;
  setView: (view: DashboardView) => void;
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
    }),
    { name: 'centre-soutien.dashboard-view' },
  ),
);
