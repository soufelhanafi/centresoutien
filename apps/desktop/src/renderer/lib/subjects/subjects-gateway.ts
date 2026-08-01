import type { SubjectScope, SubjectView } from './subject-view';
import { ipcSubjectsGateway } from './ipc-subjects-gateway';

/**
 * The seam the subject-consuming UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component. Read-only: SOU-124 exposes the name
 * channels (`subject.list` / `subject.get`); the CRUD write path is SOU-47.
 */
export interface SubjectsGateway {
  list(scope: SubjectScope): Promise<readonly SubjectView[]>;
  get(id: string): Promise<SubjectView | null>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const subjectsGateway: SubjectsGateway = ipcSubjectsGateway;
