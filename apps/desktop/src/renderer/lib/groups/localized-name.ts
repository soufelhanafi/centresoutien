import type { LocalizedName } from './group-view';

/**
 * A bilingual name in the active locale (Arabic under `ar`, French otherwise). The Arabic side may be
 * empty since SOU-271, so a single-label display falls back to French to stay identifiable (display-only).
 */
export function localizedName(name: LocalizedName, locale: string): string {
  return (locale === 'ar' ? name.ar : name.fr) || name.fr;
}
