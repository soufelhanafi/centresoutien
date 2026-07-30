import type { StudentView } from '../students/student-view';
import type { ParentInput, ParentListFilter, ParentView } from './parent-view';
import { ipcParentsGateway } from './ipc-parents-gateway';

/**
 * The seam the Parent UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable in
 * one place with no change to any component.
 *
 * ## Contract status (SOU-41 frontend ↔ SOU-40/41 domain)
 *
 * All channels are published (`parent.create` / `list` / `get` / `update` /
 * `archive` / `children`), so this ships against the real
 * {@link ipcParentsGateway}. `children` returns the guardian's linked students as
 * the same {@link StudentView} the Students module uses.
 */
export interface ParentsGateway {
  list(filter: ParentListFilter): Promise<readonly ParentView[]>;
  get(id: string): Promise<ParentView | null>;
  create(input: ParentInput): Promise<ParentView>;
  update(id: string, input: ParentInput): Promise<ParentView>;
  archive(id: string): Promise<void>;
  children(id: string): Promise<readonly StudentView[]>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const parentsGateway: ParentsGateway = ipcParentsGateway;
