import type { StudentView } from './student-view';

/** The student's name in the active locale (Arabic under `ar`, French otherwise). */
export function localizedName(student: StudentView, locale: string): string {
  return locale === 'ar' ? student.name.ar : student.name.fr;
}
