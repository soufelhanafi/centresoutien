import type { SubjectView } from './subject-view';

/** A subject's name in the active locale (Arabic under `ar`, French otherwise). */
export function localizedSubjectName(name: SubjectView['name'], locale: string): string {
  return locale === 'ar' ? name.ar : name.fr;
}
