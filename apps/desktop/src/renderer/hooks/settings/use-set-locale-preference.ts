import { useMutation } from '@tanstack/react-query';
import type { Locale } from '../../i18n/direction';

/**
 * Persists the chosen locale to the main-process preference file over the
 * typed IPC bridge (SOU-31 language tab), so it survives a restart. The
 * caller also calls `i18n.changeLanguage` itself for the immediate,
 * no-reload switch — main never pushes locale changes to a running renderer.
 */
export function useSetLocalePreference() {
  return useMutation({
    mutationFn: (input: { locale: Locale }) => window.api.invoke('preferences.locale.set', input),
  });
}
