import type { GroupInput } from '@centresoutien/domain';
import type {
  GroupFormOptions,
  GroupRow,
  GroupStatus,
  RosterEntry,
  StudentOption,
} from './group-view';
import { mockGroupsGateway } from './mock-groups-gateway';

/**
 * The seam the Group UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-50 frontend ↔ SOU-120 / SOU-126 / SOU-127)
 *
 * The write path is fully published: `group.create` / `group.update` /
 * `group.archive` / `group.restore` and `enrollment.create` / `enrollment.unenroll`
 * all exist with SQLite-backed handlers. What is **not** published yet, and why
 * this ships against {@link mockGroupsGateway} exactly like the planner (SOU-54):
 *
 * - **Enriched read model (names + `enrolledCount` → fill %) and the roster** —
 *   `group.list` returns the bare entity (ids only, no subject/room/teacher name,
 *   no enrollment count) and there is no roster channel. That join is **SOU-127**;
 *   until it lands the list/detail/roster are served from the mock.
 * - **Subject options / names** — there is **no `subject.list` channel**, so the
 *   form's subject picker and the row's subject name have no real source. (Rooms
 *   and teachers do have `room.list` / `teacher.list`.) Requested on Linear.
 *
 * When both land, add an `ipc-groups-gateway.ts` that maps `list`/`get`/`roster`
 * onto the SOU-127 read model and `create`/`update`/`archive`/`restore`/
 * `addStudent`/`removeStudent` onto the write channels, then swap the one line
 * below. No component changes.
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

/** The active gateway. Mock today; swap for the IPC adapter when SOU-127 lands. */
export const groupsGateway: GroupsGateway = mockGroupsGateway;
