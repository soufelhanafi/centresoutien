import { localizedText } from './localized-text';
import type { SessionFormOptions } from './session-options';
import type { ScheduleExportViewFilter } from './schedule-export';

/** Which slice of the grid the export dialog's view-kind tabs offer. */
export type ScheduleViewScope = ScheduleExportViewFilter['scope'];

/** One selectable room/teacher/group for the export dialog's entity picker. */
export type ScheduleExportEntityOption = {
  readonly value: string;
  readonly label: string;
  readonly examPrep: boolean;
};

/**
 * The room/teacher/group options for the picked scope, reusing the same
 * option lists the session form already loads (`useSessionFormOptions`) so the
 * export dialog never invents its own room/teacher/group source of truth.
 * `'full'` needs no entity, so it returns an empty list.
 */
export function scheduleExportEntityOptions(
  scope: ScheduleViewScope,
  options: SessionFormOptions,
  locale: string,
  unknownSubjectLabel: string,
): readonly ScheduleExportEntityOption[] {
  if (scope === 'room') {
    return options.rooms.map((room) => ({ value: room.id, label: room.name, examPrep: false }));
  }
  if (scope === 'teacher') {
    return options.teachers.map((teacher) => ({
      value: teacher.id,
      label: localizedText(teacher.name, locale),
      examPrep: false,
    }));
  }
  if (scope === 'group') {
    return options.groups.map((group) => {
      const subject =
        group.subjectName === null ? unknownSubjectLabel : localizedText(group.subjectName, locale);
      const suffix = group.level === null ? '' : ` — ${group.level}`;
      return { value: group.id, label: `${subject}${suffix}`, examPrep: group.kind === 'exam-prep' };
    });
  }
  return [];
}

/**
 * Builds the request's `view` payload for the picked scope + entity id,
 * denormalizing the display name(s) from `options` so the backend needs no
 * extra lookup (`scheduleExportViewFilterSchema`, SOU-107). Falls back to
 * `'full'` if the id isn't in `options` — unreachable through the dialog UI,
 * since the entity picker only ever offers ids from the same `options`, but
 * kept total rather than throwing on a stale id.
 */
export function scheduleViewFilterOf(
  scope: ScheduleViewScope,
  entityId: string,
  options: SessionFormOptions,
): ScheduleExportViewFilter {
  if (scope === 'room') {
    const room = options.rooms.find((candidate) => candidate.id === entityId);
    return room ? { scope: 'room', roomId: room.id, roomName: room.name } : { scope: 'full' };
  }
  if (scope === 'teacher') {
    const teacher = options.teachers.find((candidate) => candidate.id === entityId);
    return teacher ? { scope: 'teacher', teacherId: teacher.id, teacherName: teacher.name } : { scope: 'full' };
  }
  if (scope === 'group') {
    const group = options.groups.find((candidate) => candidate.id === entityId);
    return group
      ? { scope: 'group', groupId: group.id, subjectName: group.subjectName, level: group.level }
      : { scope: 'full' };
  }
  return { scope: 'full' };
}
