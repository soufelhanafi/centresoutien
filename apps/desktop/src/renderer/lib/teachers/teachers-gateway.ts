import type { TeacherInput, TeacherListFilter, TeacherView } from './teacher-view';
import { ipcTeachersGateway } from './ipc-teachers-gateway';

/**
 * The seam the Teacher UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-37 frontend ↔ SOU-36/SOU-37 domain)
 *
 * All six channels are published (`teacher.create` / `list` / `get` / `update` /
 * `archive` / `restore`), so this ships against the real {@link ipcTeachersGateway}.
 * `list` now takes a `status` scope (active | archived) and `restore` clears the
 * tombstone, mirroring the Rooms gateway.
 */
export interface TeachersGateway {
  list(filter: TeacherListFilter): Promise<readonly TeacherView[]>;
  get(id: string): Promise<TeacherView | null>;
  create(input: TeacherInput): Promise<TeacherView>;
  update(id: string, input: TeacherInput): Promise<TeacherView>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const teachersGateway: TeachersGateway = ipcTeachersGateway;
