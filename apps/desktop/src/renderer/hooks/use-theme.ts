import { useEffect } from 'react';
import { useThemeStore, type ThemePreference } from '../stores/theme-store';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function resolveIsDark(preference: ThemePreference): boolean {
  return preference === 'system' ? window.matchMedia(DARK_MEDIA_QUERY).matches : preference === 'dark';
}

export type UseThemeResult = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

/**
 * Keeps the `dark` class on `<html>` in sync with the persisted preference,
 * live — mirrors `useHtmlDirection`'s single-source-of-truth root attribute
 * approach (CLAUDE.md §8). `public/theme-init.js` already applies the class
 * before React mounts (no FOUC); this hook takes over afterwards and also
 * tracks OS-level changes while `preference === 'system'`.
 */
export function useTheme(): UseThemeResult {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolveIsDark(preference));

    if (preference !== 'system') return;

    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => root.classList.toggle('dark', event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return { preference, setPreference };
}
