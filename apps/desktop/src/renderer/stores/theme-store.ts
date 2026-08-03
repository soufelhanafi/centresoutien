import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'centre-soutien.theme';

type ThemeState = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

/**
 * Local, device-scoped appearance preference — no multi-user identity system
 * exists (CLAUDE.md §4), so this is pure Presentation-layer state. Persisted
 * to localStorage so the choice survives an app restart. `public/theme-init.js`
 * reads the same storage key synchronously before React mounts to avoid FOUC.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'system',
      setPreference: (preference) => set({ preference }),
    }),
    { name: THEME_STORAGE_KEY },
  ),
);
