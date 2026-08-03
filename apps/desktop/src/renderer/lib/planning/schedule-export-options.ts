import { localizedText } from './localized-text';
import type { SessionFormOptions } from './session-options';

/** One selectable room/teacher/group for the export dialog's entity picker. */
export type ScheduleExportEntityOption = {
  readonly value: string;
  readonly label: string;
  readonly examPrep: boolean;
};

/**
 * The room/teacher/group options for the picked view kind, reusing the same
 * option lists the session form already loads (`useSessionFormOptions`) so the
 * export dialog never invents its own room/teacher/group source of truth.
 * `'full'` needs no entity, so it returns an empty list.
 */
export function scheduleExportEntityOptions(
  viewKind: 'full' | 'room' | 'teacher' | 'group',
  options: SessionFormOptions,
  locale: string,
  unknownSubjectLabel: string,
): readonly ScheduleExportEntityOption[] {
  if (viewKind === 'room') {
    return options.rooms.map((room) => ({ value: room.id, label: room.name, examPrep: false }));
  }
  if (viewKind === 'teacher') {
    return options.teachers.map((teacher) => ({
      value: teacher.id,
      label: localizedText(teacher.name, locale),
      examPrep: false,
    }));
  }
  if (viewKind === 'group') {
    return options.groups.map((group) => {
      const subject =
        group.subjectName === null ? unknownSubjectLabel : localizedText(group.subjectName, locale);
      const suffix = group.level === null ? '' : ` — ${group.level}`;
      return { value: group.id, label: `${subject}${suffix}`, examPrep: group.kind === 'exam-prep' };
    });
  }
  return [];
}
