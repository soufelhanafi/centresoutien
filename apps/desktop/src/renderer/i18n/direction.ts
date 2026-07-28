export const LOCALES = ['fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

/** French is the default and the source of truth (CLAUDE.md §8). */
export const DEFAULT_LOCALE: Locale = 'fr';

const RTL_LOCALES = new Set<string>(['ar']);

export function directionForLocale(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
