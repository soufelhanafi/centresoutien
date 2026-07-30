import type { StudentInput, StudentListFilter, StudentView } from './student-view';
import { ipcStudentsGateway } from './ipc-students-gateway';

/**
 * The seam the Student UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-39 frontend ↔ SOU-38 domain)
 *
 * All five channels are now published (`student.create` / `list` / `get` /
 * `update` / `archive`), so this ships against the real {@link ipcStudentsGateway}.
 * The in-memory `MockStudentsGateway` stays in the tree for unit tests, which
 * exercise the same interface without Electron.
 */
export interface StudentsGateway {
  list(filter: StudentListFilter): Promise<readonly StudentView[]>;
  get(id: string): Promise<StudentView | null>;
  create(input: StudentInput): Promise<StudentView>;
  update(id: string, input: StudentInput): Promise<StudentView>;
  archive(id: string): Promise<void>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const studentsGateway: StudentsGateway = ipcStudentsGateway;
