import type { NiveauInput, NiveauScope, NiveauUpdateInput, NiveauUsageView, NiveauView } from './niveau-view';
import { ipcNiveauxGateway } from './ipc-niveaux-gateway';

/**
 * The seam the niveau-consuming UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component. `list` back the manage screen and
 * the list filters; `listWithUsage` / `create` / `update` back the CRUD screen.
 * Mirrors `SubjectsGateway`.
 */
export interface NiveauxGateway {
  list(scope: NiveauScope): Promise<readonly NiveauView[]>;
  get(id: string): Promise<NiveauView | null>;
  listWithUsage(): Promise<readonly NiveauUsageView[]>;
  create(input: NiveauInput): Promise<NiveauView>;
  update(id: string, input: NiveauUpdateInput): Promise<NiveauView>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const niveauxGateway: NiveauxGateway = ipcNiveauxGateway;
