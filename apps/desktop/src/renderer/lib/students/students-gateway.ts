import type { StudentInput, StudentListFilter, StudentView } from './student-view';
import { mockStudentsGateway } from './mock-students-gateway';

/**
 * The seam the Student UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-39 frontend ↔ SOU-38 domain)
 *
 * Only `create` is published today (`student.create` IPC + `CreateStudent`
 * use case). `list` / `get` / `update` / `archive` have **no IPC channel yet**,
 * so this ships against {@link mockStudentsGateway} — an in-memory stand-in —
 * behind this same interface. Swapping to the real adapter is editing the
 * `activeGateway` line below, once the domain publishes:
 *
 * - `student.list`   → request `{ search: string }`, response `{ students: StudentDto[] }`
 * - `student.get`    → request `{ id: string }`, response `{ student: StudentDto | null }`
 * - `student.update` → request `studentInputSchema & { id }`, response `{ student: StudentDto }`
 * - `student.archive`→ request `{ id: string }`, response `{ ok: true }` (soft delete)
 *
 * where `StudentDto` is {@link StudentView} (envelope stripped, dates serialized).
 * `create` already maps to `window.api.invoke('student.create', input)`.
 */
export interface StudentsGateway {
  list(filter: StudentListFilter): Promise<readonly StudentView[]>;
  get(id: string): Promise<StudentView | null>;
  create(input: StudentInput): Promise<StudentView>;
  update(id: string, input: StudentInput): Promise<StudentView>;
  archive(id: string): Promise<void>;
}

/**
 * The active gateway. Replace with an `ipcStudentsGateway` (calling
 * `window.api.invoke`) once the domain channels above land — nothing else in
 * the renderer changes.
 */
export const studentsGateway: StudentsGateway = mockStudentsGateway;
