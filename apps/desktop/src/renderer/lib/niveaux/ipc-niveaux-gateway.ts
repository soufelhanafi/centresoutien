import type { IpcChannel } from '../../../shared/ipc/contract';
import type { NiveauChannel, NiveauRequestOf, NiveauResponseOf } from '../niveau-contract';
import type { NiveauxGateway } from './niveaux-gateway';
import type { NiveauInput, NiveauUpdateInput, NiveauUsageView, NiveauView } from './niveau-view';

// TEMP bridge: `niveau.*` channels do not exist in `shared/ipc/contract` until
// the domain-backend merge lands (the main dispatcher enforces a handler per
// channel, so this worktree cannot register them). Once the merge adds the
// channels, delete this helper and call `window.api.invoke` directly. The
// `as unknown as` hop is needed only because the two response unions do not
// structurally overlap yet.
function invokeNiveau<C extends NiveauChannel>(
  channel: C,
  request: NiveauRequestOf<C>,
): Promise<NiveauResponseOf<C>> {
  return window.api.invoke(channel as IpcChannel, request) as unknown as Promise<NiveauResponseOf<C>>;
}

/**
 * The real {@link NiveauxGateway}: maps each method onto its typed IPC channel.
 * No business logic — the domain use cases behind the channels own it. `create`
 * and `update` return the saved view directly (per the SOU-260 contract), unlike
 * the subject/student channels which echo an id and read back through `get`.
 */
class IpcNiveauxGateway implements NiveauxGateway {
  async list(): Promise<readonly NiveauView[]> {
    const { niveaux } = await invokeNiveau('niveau.list', {});
    return niveaux;
  }

  async listActive(): Promise<readonly NiveauView[]> {
    const { niveaux } = await invokeNiveau('niveau.listActive', {});
    return niveaux;
  }

  async listWithUsage(): Promise<readonly NiveauUsageView[]> {
    const { niveaux } = await invokeNiveau('niveau.listWithUsage', {});
    return niveaux;
  }

  async create(input: NiveauInput): Promise<NiveauView> {
    const { niveau } = await invokeNiveau('niveau.create', input);
    return niveau;
  }

  async update(input: NiveauUpdateInput): Promise<NiveauView> {
    const { niveau } = await invokeNiveau('niveau.update', input);
    return niveau;
  }
}

export const ipcNiveauxGateway: NiveauxGateway = new IpcNiveauxGateway();
