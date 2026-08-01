import type { GroupInput } from '@centresoutien/domain';
import type {
  GroupFormOptions,
  GroupRow,
  GroupStatus,
  RosterEntry,
  StudentOption,
} from './group-view';
import { ipcGroupsGateway } from './ipc-groups-gateway';

/**
 * The seam the Group UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-50 frontend ↔ SOU-120 / SOU-126 / SOU-127)
 *
 * ## Contract status (SOU-51)
 *
 * The **enrollment slice** now runs on real channels via {@link ipcGroupsGateway}:
 * `roster` → `group.roster` (SOU-127 read model), `enrollableStudents` →
 * `student.list` minus the roster, `addStudent` → `enrollment.create`,
 * `removeStudent` → `enrollment.unenroll`. The domain enforces the capacity,
 * duplicate, cross-kind, and subscription-coverage guards; the renderer surfaces
 * each as its own localized message (see {@link enrollmentErrorCode}).
 *
 * The group **definition** surface (`list`/`get`/`formOptions` and
 * `create`/`update`/`archive`/`restore`) still delegates to the mock inside
 * {@link ipcGroupsGateway}, because the enriched list read model and the subject
 * picker both need `subject.list` (**SOU-124**), which has not landed. When it
 * does, point those methods at the real channels — no component changes.
 */
export interface GroupsGateway {
  list(status: GroupStatus): Promise<readonly GroupRow[]>;
  get(id: string): Promise<GroupRow | null>;
  formOptions(): Promise<GroupFormOptions>;
  roster(groupId: string): Promise<readonly RosterEntry[]>;
  /** Students not already enrolled in the group — the add-student picker source. */
  enrollableStudents(groupId: string): Promise<readonly StudentOption[]>;
  create(input: GroupInput): Promise<GroupRow>;
  update(id: string, input: GroupInput): Promise<GroupRow>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  addStudent(groupId: string, studentId: string, startMonth: string): Promise<void>;
  removeStudent(enrollmentId: string): Promise<void>;
}

/** The active gateway: real enrollment channels, mocked group definition (SOU-51). */
export const groupsGateway: GroupsGateway = ipcGroupsGateway;
