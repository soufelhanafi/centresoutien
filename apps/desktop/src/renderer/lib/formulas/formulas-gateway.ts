import type { FormulaScope, FormulaView, FormulaWriteInput } from './formula-view';
import { ipcFormulasGateway } from './ipc-formulas-gateway';

/**
 * The seam the formula-consuming UI depends on (Dependency Inversion). Hooks
 * call this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component. Mirrors
 * `SubjectsGateway`. `clone` and `deactivate` are Formula-specific: cloning
 * makes a fresh mutable copy of any source formula ("dupliquer"); deactivate
 * is the one-directional `active: false` write that bypasses the immutability
 * guard `update` enforces.
 */
export interface FormulasGateway {
  list(scope: FormulaScope): Promise<readonly FormulaView[]>;
  get(id: string): Promise<FormulaView | null>;
  create(input: FormulaWriteInput): Promise<FormulaView>;
  update(id: string, input: FormulaWriteInput): Promise<FormulaView>;
  clone(id: string): Promise<FormulaView>;
  deactivate(id: string): Promise<FormulaView>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const formulasGateway: FormulasGateway = ipcFormulasGateway;
