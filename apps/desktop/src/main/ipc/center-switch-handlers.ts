import type { CenterCode, SwitchCenter } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { CenterSummary } from '../../data/sqlite/center-directory';

export type SwitchCenterUseCase = Pick<SwitchCenter, 'execute'>;

/** The slice of `GetCenterProfile` the current-center handler needs: the display
 *  name, or `null` before the profile is first saved. Structural so the real use
 *  case (returning a full `Center`) satisfies it without a coupling import. */
export type CenterProfileReader = { execute: () => Promise<{ readonly name: string } | null> };

/**
 * Dependencies for the center-switcher channels (SOU-96), split out of
 * `handlers.ts` like the other domain-area handler modules. `listCenters` and the
 * current-center identity come from the app shell (an fs directory scan and the
 * open container's own code); `switchCenter` is the plan-gated domain use case
 * that drives the hot-swap. None of these carry business logic here — the gate
 * lives in `SwitchCenter`, the isolation in the directory + swap adapters.
 */
export type CenterSwitchHandlerDeps = {
  listCenters: () => Promise<readonly CenterSummary[]>;
  switchCenter: SwitchCenterUseCase;
  currentCentreId: () => string;
  activeCenterCode: () => CenterCode;
  getCenterProfile: CenterProfileReader;
};

/**
 * The open center's identity DTO — the `center.current` response and the payload
 * the hot-swap emits on `center.changed`. The display name is the saved profile
 * name, falling back to the tenant `centerCode` before the profile exists.
 */
export async function currentCenterSummary(deps: {
  currentCentreId: () => string;
  activeCenterCode: () => CenterCode;
  getCenterProfile: CenterProfileReader;
}): Promise<{ centreId: string; centerCode: string; displayName: string }> {
  const profile = await deps.getCenterProfile.execute();
  const centerCode = deps.activeCenterCode();
  const name = profile?.name.trim() ?? '';
  return {
    centreId: deps.currentCentreId(),
    centerCode,
    displayName: name.length > 0 ? name : centerCode,
  };
}

export function createCenterSwitchHandlers(
  deps: CenterSwitchHandlerDeps,
): Pick<IpcHandlers, 'center.list' | 'center.current' | 'center.switch'> {
  return {
    'center.list': async () => {
      const centers = await deps.listCenters();
      return { centers: centers.map((center) => ({ ...center })) };
    },
    'center.current': () => currentCenterSummary(deps),
    'center.switch': (request) => deps.switchCenter.execute({ centreId: request.centreId }),
  };
}
