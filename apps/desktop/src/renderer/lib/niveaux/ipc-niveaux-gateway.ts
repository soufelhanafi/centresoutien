import type { NiveauInput, NiveauScope, NiveauUpdateInput, NiveauUsageView, NiveauView } from './niveau-view';
import type { NiveauxGateway } from './niveaux-gateway';

/**
 * The real {@link NiveauxGateway}: maps each method onto its typed IPC channel
 * (SOU-260). No business logic — the domain use cases behind the channels own it.
 * `create` echoes only the new id, so the fresh niveau is read back through
 * `get` — the same projection as every other read. Mirrors `IpcSubjectsGateway`.
 */
class IpcNiveauxGateway implements NiveauxGateway {
  async list(scope: NiveauScope): Promise<readonly NiveauView[]> {
    const { niveaux } = await window.api.invoke('niveau.list', { scope });
    return niveaux;
  }

  async get(id: string): Promise<NiveauView | null> {
    const { niveau } = await window.api.invoke('niveau.get', { id });
    return niveau;
  }

  async listWithUsage(): Promise<readonly NiveauUsageView[]> {
    const { niveaux } = await window.api.invoke('niveau.listWithUsage', {});
    return niveaux;
  }

  async create(input: NiveauInput): Promise<NiveauView> {
    const { id } = await window.api.invoke('niveau.create', input);
    const created = await this.get(id);
    if (created === null) {
      throw new Error(`niveau ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: NiveauUpdateInput): Promise<NiveauView> {
    const { niveau } = await window.api.invoke('niveau.update', { ...input, id });
    return niveau;
  }
}

export const ipcNiveauxGateway: NiveauxGateway = new IpcNiveauxGateway();
