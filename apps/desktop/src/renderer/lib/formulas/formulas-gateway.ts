import type { FormulaView } from './formula-view';
import { ipcFormulasGateway } from './ipc-formulas-gateway';

/**
 * The seam the formula-picker UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component. Backs the
 * new-subscription formula picker (SOU-65) — only the active picker set exists
 * (mirrors `FormulaRepository`, which has no `listAll`).
 */
export interface FormulasGateway {
  list(): Promise<readonly FormulaView[]>;
}

/** The active gateway: the real IPC adapter. */
export const formulasGateway: FormulasGateway = ipcFormulasGateway;
