import type { CenterHoursOverridesGateway } from './overrides-gateway';
import type { CenterHoursOverrideInput, CenterHoursOverrideView } from './override-view';

/**
 * The real {@link CenterHoursOverridesGateway}: maps each method onto its typed
 * `centerHoursOverride.*` IPC channel (SOU-165). No business logic — the domain
 * use cases behind the channels own the plan gate and validation; centerCode /
 * device / user are injected in main, never sent from the renderer. `list` with
 * no range returns every live override for the Settings manager; `save` echoes
 * the persisted override so the cache primes from exactly what was stored.
 */
class IpcCenterHoursOverridesGateway implements CenterHoursOverridesGateway {
  async list(): Promise<readonly CenterHoursOverrideView[]> {
    const { overrides } = await window.api.invoke('centerHoursOverride.list', {});
    return overrides;
  }

  async save(input: CenterHoursOverrideInput): Promise<CenterHoursOverrideView> {
    const { override } = await window.api.invoke('centerHoursOverride.save', input);
    return override;
  }

  async getActive(date: string): Promise<CenterHoursOverrideView | null> {
    const { override } = await window.api.invoke('centerHoursOverride.getActive', { date });
    return override;
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('centerHoursOverride.archive', { id });
  }
}

export const ipcCenterHoursOverridesGateway: CenterHoursOverridesGateway =
  new IpcCenterHoursOverridesGateway();
