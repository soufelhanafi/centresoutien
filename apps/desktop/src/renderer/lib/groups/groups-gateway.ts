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
 * ## Contract status (SOU-50 / SOU-51)
 *
 * Every method runs on real channels via {@link ipcGroupsGateway}: group
 * definition (`list`/`get`/`formOptions`/`create`/`update`/`archive`/`restore`)
 * maps onto `group.*`, resolving subject/room/teacher names through `subject.list`
 * (SOU-124) now that it has landed. The enrollment slice maps `roster` →
 * `group.roster` (SOU-127 read model), `enrollableStudents` → `student.list` minus
 * the roster, `addStudent` → `enrollment.create`, `removeStudent` →
 * `enrollment.unenroll`. The domain enforces the capacity, duplicate, cross-kind,
 * and subscription-coverage guards; the renderer surfaces each as its own
 * localized message (see {@link enrollmentErrorCode}).
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
