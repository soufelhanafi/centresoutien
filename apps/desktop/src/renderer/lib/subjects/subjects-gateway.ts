import type { SubjectInput, SubjectScope, SubjectUpdateInput, SubjectUsageView, SubjectView } from './subject-view';
import { ipcSubjectsGateway } from './ipc-subjects-gateway';

/**
 * The seam the subject-consuming UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component. `list` / `get` back name-resolution
 * consumers (SOU-124); `listWithUsage` / `create` / `update` / `archive` back the
 * SOU-47 CRUD table.
 */
export interface SubjectsGateway {
  list(scope: SubjectScope): Promise<readonly SubjectView[]>;
  get(id: string): Promise<SubjectView | null>;
  listWithUsage(): Promise<readonly SubjectUsageView[]>;
  create(input: SubjectInput): Promise<SubjectView>;
  update(id: string, input: SubjectUpdateInput): Promise<SubjectView>;
  archive(id: string): Promise<void>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const subjectsGateway: SubjectsGateway = ipcSubjectsGateway;
