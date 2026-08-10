import type { SubjectView } from './subject-view';

/** A bilingual value (`{ fr, ar }`) picked for the active locale (Arabic under `ar`, French otherwise). */
export function pickLocalized(value: { readonly fr: string; readonly ar: string }, locale: string): string {
  return locale === 'ar' ? value.ar : value.fr;
}

/** A subject's name in the active locale. */
export function localizedSubjectName(name: SubjectView['name'], locale: string): string {
  return pickLocalized(name, locale);
}
