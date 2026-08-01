import type { GroupInput } from '@centresoutien/domain';
import type { GroupsGateway } from './groups-gateway';
import type {
  GroupFormOptions,
  GroupRow,
  GroupStatus,
  RosterEntry,
  StudentOption,
} from './group-view';
import { mockGroupsGateway } from './mock-groups-gateway';

/**
 * The real {@link GroupsGateway} for the **enrollment slice** (SOU-51): roster,
 * the add-student picker, enroll, and unenroll all map onto their typed IPC
 * channels. No business logic — the domain use cases behind the channels own the
 * capacity / duplicate / cross-kind / subscription-coverage guards; this adapter
 * only translates shapes.
 *
 * The group *definition* surface — `list` / `get` / `formOptions` and
 * `create` / `update` / `archive` / `restore` — still delegates to
 * {@link mockGroupsGateway}, because the enriched list read model and the
 * subject picker both need `subject.list` (SOU-124), which has not landed. When
 * it does, point those methods at `group.listWithCounts` / `group.*` and delete
 * the mock delegation — no component changes.
 */
class IpcGroupsGateway implements GroupsGateway {
  // --- Group definition (mocked until SOU-124 subject.list lands) ---
  list(status: GroupStatus): Promise<readonly GroupRow[]> {
    return mockGroupsGateway.list(status);
  }

  get(id: string): Promise<GroupRow | null> {
    return mockGroupsGateway.get(id);
  }

  formOptions(): Promise<GroupFormOptions> {
    return mockGroupsGateway.formOptions();
  }

  create(input: GroupInput): Promise<GroupRow> {
    return mockGroupsGateway.create(input);
  }

  update(id: string, input: GroupInput): Promise<GroupRow> {
    return mockGroupsGateway.update(id, input);
  }

  archive(id: string): Promise<void> {
    return mockGroupsGateway.archive(id);
  }

  restore(id: string): Promise<void> {
    return mockGroupsGateway.restore(id);
  }

  // --- Enrollment slice (real channels, SOU-121/123/126/127) ---
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
}

export const ipcGroupsGateway: GroupsGateway = new IpcGroupsGateway();
