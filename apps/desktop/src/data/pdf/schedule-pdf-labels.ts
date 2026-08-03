import type { WeekdayIndex } from '@centresoutien/domain';

/**
 * The schedule PDF is rendered entirely in the main/data process, like the
 * invoice and payslip PDFs — its handful of fixed labels are hardcoded here,
 * once, in both languages (see `InvoicePdfLabels`'s doc for why this is the one
 * correct place for that). Weekday names and the exam-prep short badge reuse the
 * exact copy the live planner grid already ships in `renderer/i18n/{fr,ar}.json`
 * under `planning.*`, kept in sync by hand so the printed grid reads identically
 * to the on-screen one.
 */
export type SchedulePdfLabels = {
  documentTitle: string;
  viewFull: string;
  viewRoomPrefix: string;
  viewTeacherPrefix: string;
  viewGroupPrefix: string;
  weekdays: Record<WeekdayIndex, string>;
  examPrepBadge: string;
  unknownSubject: string;
  footer: string;
};

const FR: SchedulePdfLabels = {
  documentTitle: 'Planning hebdomadaire',
  viewFull: 'Vue complète du centre',
  viewRoomPrefix: 'Salle',
  viewTeacherPrefix: 'Enseignant(e)',
  viewGroupPrefix: 'Groupe',
  weekdays: {
    0: 'Dimanche',
    1: 'Lundi',
    2: 'Mardi',
    3: 'Mercredi',
    4: 'Jeudi',
    5: 'Vendredi',
    6: 'Samedi',
  },
  examPrepBadge: 'PE',
  unknownSubject: 'Matière inconnue',
  footer: 'Document généré par Centre Soutien.',
};

const AR: SchedulePdfLabels = {
  documentTitle: 'الجدول الأسبوعي',
  viewFull: 'نظرة شاملة على المركز',
  viewRoomPrefix: 'القاعة',
  viewTeacherPrefix: 'الأستاذ(ة)',
  viewGroupPrefix: 'المجموعة',
  weekdays: {
    0: 'الأحد',
    1: 'الإثنين',
    2: 'الثلاثاء',
    3: 'الأربعاء',
    4: 'الخميس',
    5: 'الجمعة',
    6: 'السبت',
  },
  examPrepBadge: 'ت.إ',
  unknownSubject: 'مادة غير معروفة',
  footer: 'وثيقة صادرة عن Centre Soutien.',
};

export function schedulePdfLabels(locale: 'fr' | 'ar'): SchedulePdfLabels {
  return locale === 'ar' ? AR : FR;
}
