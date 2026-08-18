import type { SubjectView } from './subject-view';

/**
 * A bilingual value (`{ fr, ar }`) picked for the active locale (Arabic under `ar`, French otherwise).
 * Since SOU-271 the Arabic side may be empty (FR-only data entry); a single-label display falls back
 * to French so the item stays identifiable. Persisted `name.ar` is never touched — this is display-only.
 */
export function pickLocalized(value: { readonly fr: string; readonly ar: string }, locale: string): string {
  return (locale === 'ar' ? value.ar : value.fr) || value.fr;
}

/** A subject's name in the active locale. */
export function localizedSubjectName(name: SubjectView['name'], locale: string): string {
  return pickLocalized(name, locale);
}
