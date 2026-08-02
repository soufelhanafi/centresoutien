import type { FormulaInput, FormulaScope, FormulaView } from './formula-view';
import type { FormulasGateway } from './formulas-gateway';

/**
 * The real {@link FormulasGateway}: maps each method onto its typed IPC channel
 * (SOU-62). No business logic — the domain use cases behind the channels own
 * it. `create` and `clone` echo only the new id, so the fresh formula is read
 * back through `get` — the same projection as every other read. Mirrors
 * `IpcSubjectsGateway`.
 */
class IpcFormulasGateway implements FormulasGateway {
  async list(scope: FormulaScope): Promise<readonly FormulaView[]> {
    const { formulas } = await window.api.invoke('formula.list', { scope });
    return formulas;
  }

  async get(id: string): Promise<FormulaView | null> {
    const { formula } = await window.api.invoke('formula.get', { id });
    return formula;
  }

  async create(input: FormulaInput): Promise<FormulaView> {
    const { id } = await window.api.invoke('formula.create', input);
    const created = await this.get(id);
    if (created === null) {
      throw new Error(`formula ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: FormulaInput): Promise<FormulaView> {
    const { formula } = await window.api.invoke('formula.update', { ...input, id });
    return formula;
  }

  async clone(id: string): Promise<FormulaView> {
    const { id: cloneId } = await window.api.invoke('formula.clone', { id });
    const cloned = await this.get(cloneId);
    if (cloned === null) {
      throw new Error(`formula ${cloneId} was cloned but could not be read back`);
    }
    return cloned;
  }

  async deactivate(id: string): Promise<FormulaView> {
    const { formula } = await window.api.invoke('formula.deactivate', { id });
    return formula;
  }
}

export const ipcFormulasGateway: FormulasGateway = new IpcFormulasGateway();
