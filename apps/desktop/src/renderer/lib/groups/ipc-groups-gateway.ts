import type { GroupInput } from '@centresoutien/domain';
import type { GroupsGateway } from './groups-gateway';
import type {
  GroupFormOptions,
  GroupRow,
  GroupStatus,
  LocalizedName,
  RosterEntry,
  StudentOption,
} from './group-view';
import type { GroupWithCountDto } from '../../../shared/ipc/contract';
import { mockGroupsGateway } from './mock-groups-gateway';

/** Subject names need `subject.list` (SOU-124); until it lands the list/detail show a placeholder. */
const SUBJECT_NAME_PLACEHOLDER: LocalizedName = { fr: '—', ar: '—' };

/**
 * The real {@link GroupsGateway} for the **read + enrollment** surface (SOU-51):
 * the group list, the group detail, the roster, the add-student picker, enroll,
 * and unenroll all map onto their typed IPC channels, so the roster operates on
 * real group ids and the domain enforces the capacity / duplicate / cross-kind /
 * subscription-coverage guards. This adapter only translates shapes — no business
 * logic.
 *
 * `group.listWithCounts` carries ids only, so room and teacher names are resolved
 * through the real `room.list` / `teacher.list` channels; **subject** names have
 * no channel yet (`subject.list` is SOU-124), so they render as
 * {@link SUBJECT_NAME_PLACEHOLDER} until it lands.
 *
 * Group **authoring** — `formOptions` / `create` / `update` — still delegates to
 * {@link mockGroupsGateway}, because the create/edit form's subject picker needs
 * `subject.list` (SOU-124). When it lands, point those at the real channels and
 * drop the placeholder — no component changes.
 */
class IpcGroupsGateway implements GroupsGateway {
  // --- Reads (real group read model; subject name placeholdered until SOU-124) ---
  async list(status: GroupStatus): Promise<readonly GroupRow[]> {
    const [{ groups }, rooms, teachers] = await Promise.all([
      window.api.invoke('group.listWithCounts', { scope: status }),
      this.roomNames(),
      this.teacherNames(),
    ]);
    return groups.map((group) => toRow(group, rooms, teachers));
  }

  async get(id: string): Promise<GroupRow | null> {
    const [rooms, teachers] = await Promise.all([this.roomNames(), this.teacherNames()]);
    // No `group.get` channel; a group may be active or archived, so scan both scopes.
    for (const scope of ['active', 'archived'] as const) {
      const { groups } = await window.api.invoke('group.listWithCounts', { scope });
      const found = groups.find((group) => group.id === id);
      if (found) return toRow(found, rooms, teachers);
    }
    return null;
  }

  // --- Group authoring (mocked until SOU-124 subject.list lands) ---
  formOptions(): Promise<GroupFormOptions> {
    return mockGroupsGateway.formOptions();
  }

  create(input: GroupInput): Promise<GroupRow> {
    return mockGroupsGateway.create(input);
  }

  update(id: string, input: GroupInput): Promise<GroupRow> {
    return mockGroupsGateway.update(id, input);
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('group.archive', { id });
  }

  async restore(id: string): Promise<void> {
    await window.api.invoke('group.restore', { id });
  }

  // --- Roster + enrollment slice (real channels, SOU-121/123/126/127) ---
  async roster(groupId: string): Promise<readonly RosterEntry[]> {
    const { roster } = await window.api.invoke('group.roster', { groupId });
    return roster.map((entry) => ({
      enrollmentId: entry.enrollmentId,
      studentId: entry.studentId,
      studentName: entry.name,
      level: entry.level,
    }));
  }

  async enrollableStudents(groupId: string): Promise<readonly StudentOption[]> {
    // No subscription-aware read model this ticket: show every un-enrolled,
    // non-archived student and let the domain reject at submit with the specific
    // reason (SOU-51 KICKOFF). The already-enrolled are removed via the roster.
    const [{ students }, { roster }] = await Promise.all([
      window.api.invoke('student.list', { search: '' }),
      window.api.invoke('group.roster', { groupId }),
    ]);
    const enrolled = new Set(roster.map((entry) => entry.studentId));
    return students
      .filter((student) => !student.archived && !enrolled.has(student.id))
      .map((student) => ({ id: student.id, name: student.name, level: student.level }));
  }

  async addStudent(groupId: string, studentId: string, startMonth: string): Promise<void> {
    await window.api.invoke('enrollment.create', {
      studentId,
      groupId,
      startMonth,
      endMonth: null,
    });
  }

  async removeStudent(enrollmentId: string): Promise<void> {
    await window.api.invoke('enrollment.unenroll', { id: enrollmentId });
  }

  /** roomId → name, resolved from both scopes so archived groups still show a name. */
  private async roomNames(): Promise<ReadonlyMap<string, string>> {
    const [active, archived] = await Promise.all([
      window.api.invoke('room.list', { scope: 'active' }),
      window.api.invoke('room.list', { scope: 'archived' }),
    ]);
    return new Map([...active.rooms, ...archived.rooms].map((room) => [room.id, room.name]));
  }

  /** teacherId → name, resolved from both scopes (a group may staff an archived teacher). */
  private async teacherNames(): Promise<ReadonlyMap<string, LocalizedName>> {
    const [active, archived] = await Promise.all([
      window.api.invoke('teacher.list', { scope: 'active', search: '' }),
      window.api.invoke('teacher.list', { scope: 'archived', search: '' }),
    ]);
    return new Map(
      [...active.teachers, ...archived.teachers].map((teacher) => [teacher.id, teacher.name]),
    );
  }
}

/** Enrich a raw group view with resolved room/teacher names + the placeholder subject name. */
function toRow(
  group: GroupWithCountDto,
  rooms: ReadonlyMap<string, string>,
  teachers: ReadonlyMap<string, LocalizedName>,
): GroupRow {
  return {
    id: group.id,
    subjectId: group.subjectId,
    subjectName: SUBJECT_NAME_PLACEHOLDER,
    roomId: group.roomId,
    roomName: rooms.get(group.roomId) ?? group.roomId,
    teacherId: group.teacherId,
    teacherName:
      group.teacherId === null
        ? null
        : (teachers.get(group.teacherId) ?? { fr: group.teacherId, ar: group.teacherId }),
    level: group.level,
    capacity: group.capacity,
    kind: group.kind,
    enrolledCount: group.enrolledCount,
    archived: group.archived,
  };
}

export const ipcGroupsGateway: GroupsGateway = new IpcGroupsGateway();
