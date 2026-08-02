import type { FormulaView } from './formula-view';
import type { FormulasGateway } from './formulas-gateway';

/** The real {@link FormulasGateway}: maps `list` onto the `formula.list` channel. */
class IpcFormulasGateway implements FormulasGateway {
  async list(): Promise<readonly FormulaView[]> {
    const { formulas } = await window.api.invoke('formula.list', {});
    return formulas;
  }
}

export const ipcFormulasGateway: FormulasGateway = new IpcFormulasGateway();
