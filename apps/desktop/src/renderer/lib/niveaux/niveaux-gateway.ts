import type { NiveauView, NiveauInput, NiveauUpdateInput, NiveauUsageView } from './niveau-view';
import { ipcNiveauxGateway } from './ipc-niveaux-gateway';

/**
 * The seam the Niveau UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component. Mirrors `SubjectsGateway`.
 */
export interface NiveauxGateway {
  /** Every live level (active and inactive) — for filters and the manage screen. */
  list(): Promise<readonly NiveauView[]>;
  /** The assignable picker set — for form selects. */
  listActive(): Promise<readonly NiveauView[]>;
  /** Every level paired with its reference counts — for the manage screen + archive guard. */
  listWithUsage(): Promise<readonly NiveauUsageView[]>;
  create(input: NiveauInput): Promise<NiveauView>;
  update(input: NiveauUpdateInput): Promise<NiveauView>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const niveauxGateway: NiveauxGateway = ipcNiveauxGateway;
