import type { ScheduleExportViewFilter } from './schedule-pdf-input';
import type { SchedulePdfLabels } from './schedule-pdf-labels';

/** The header's scope subtitle — "Salle 3", "Enseignant(e) — Nadia Alaoui",
 *  "Groupe — Math (Terminale)" — built once, pure, so both the header drawing
 *  and any future preview surface can share it. */
export function scheduleViewTitle(
  view: ScheduleExportViewFilter,
  labels: SchedulePdfLabels,
  locale: 'fr' | 'ar',
): string {
  switch (view.scope) {
    case 'full':
      return labels.viewFull;
    case 'room':
      return `${labels.viewRoomPrefix} — ${view.roomName}`;
    case 'teacher':
      return `${labels.viewTeacherPrefix} — ${view.teacherName[locale]}`;
    case 'group': {
      const subject = view.subjectName ? view.subjectName[locale] : labels.unknownSubject;
      return view.level ? `${labels.viewGroupPrefix} — ${subject} (${view.level})` : `${labels.viewGroupPrefix} — ${subject}`;
    }
  }
}
