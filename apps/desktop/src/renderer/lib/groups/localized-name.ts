import type { LocalizedName } from './group-view';

/** A bilingual name in the active locale (Arabic under `ar`, French otherwise). */
export function localizedName(name: LocalizedName, locale: string): string {
  return locale === 'ar' ? name.ar : name.fr;
}
