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

/**
 * The real {@link GroupsGateway}: every method maps onto its typed IPC channel, so
 * the full group CRUD + enrollment surface (SOU-50/51) operates on real group ids
 * and the domain enforces the capacity / duplicate / cross-kind / subscription-
 * coverage guards. This adapter only translates shapes — no business logic.
 *
 * `group.listWithCounts` and `group.update` carry ids only, so teacher and
 * subject names are resolved through the real `teacher.list` / `subject.list`
 * channels (SOU-124). Name resolution reads subjects with scope
 * `'all'` so a group can still display the name of a subject that was deactivated
 * after the group was created; the create/edit form's subject picker reads scope
 * `'active'` only, matching the domain's `GroupSubjectUnavailableError` invariant
 * (a group can only be pointed at a live, active subject).
 */
class IpcGroupsGateway implements GroupsGateway {
  async list(status: GroupStatus): Promise<readonly GroupRow[]> {
    const [{ groups }, teachers, subjects] = await Promise.all([
      window.api.invoke('group.listWithCounts', { scope: status }),
      this.teacherNames(),
      this.subjectNames(),
    ]);
    return groups.map((group) => toRow(group, teachers, subjects));
  }

  async get(id: string): Promise<GroupRow | null> {
    const [teachers, subjects] = await Promise.all([
      this.teacherNames(),
      this.subjectNames(),
    ]);
    // No `group.get` channel; a group may be active or archived, so scan both scopes.
    for (const scope of ['active', 'archived'] as const) {
      const { groups } = await window.api.invoke('group.listWithCounts', { scope });
      const found = groups.find((group) => group.id === id);
      if (found) return toRow(found, teachers, subjects);
    }
    return null;
  }

  async formOptions(): Promise<GroupFormOptions> {
    const [{ subjects }, { teachers }] = await Promise.all([
      window.api.invoke('subject.list', { scope: 'active' }),
      window.api.invoke('teacher.list', { scope: 'active', search: '' }),
    ]);
    return {
      subjects: subjects.map((subject) => ({ id: subject.id, name: subject.name })),
      teachers: teachers.map((teacher) => ({ id: teacher.id, name: teacher.name })),
    };
  }

  async create(input: GroupInput): Promise<GroupRow> {
    const { id } = await window.api.invoke('group.create', input);
    const created = await this.get(id);
    if (created === null) {
      throw new Error(`group ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: GroupInput): Promise<GroupRow> {
    await window.api.invoke('group.update', { ...input, id });
    const updated = await this.get(id);
    if (updated === null) {
      throw new Error(`group ${id} was updated but could not be read back`);
    }
    return updated;
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

  /** subjectId → name, scope `'all'` so a group keeps showing a since-deactivated subject's name. */
  private async subjectNames(): Promise<ReadonlyMap<string, LocalizedName>> {
    const { subjects } = await window.api.invoke('subject.list', { scope: 'all' });
    return new Map(subjects.map((subject) => [subject.id, subject.name]));
  }
}

/** Enrich a raw group view with resolved teacher/subject names. */
function toRow(
  group: GroupWithCountDto,
  teachers: ReadonlyMap<string, LocalizedName>,
  subjects: ReadonlyMap<string, LocalizedName>,
): GroupRow {
  return {
    id: group.id,
    subjectId: group.subjectId,
    subjectName: subjects.get(group.subjectId) ?? { fr: group.subjectId, ar: group.subjectId },
    teacherId: group.teacherId,
    teacherName:
      group.teacherId === null
        ? null
        : (teachers.get(group.teacherId) ?? { fr: group.teacherId, ar: group.teacherId }),
    level: group.level,
    niveauId: group.niveauId ?? null,
    capacity: group.capacity,
    kind: group.kind,
    enrolledCount: group.enrolledCount,
    archived: group.archived,
  };
}

export const ipcGroupsGateway: GroupsGateway = new IpcGroupsGateway();
