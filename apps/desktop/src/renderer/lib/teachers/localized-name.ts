import type { TeacherView } from './teacher-view';

/** The teacher's name in the active locale (Arabic under `ar`, French otherwise). */
export function localizedName(teacher: TeacherView, locale: string): string {
  return locale === 'ar' ? teacher.name.ar : teacher.name.fr;
}
