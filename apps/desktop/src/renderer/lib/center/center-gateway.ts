/**
 * The center switcher's list row (SOU-96): the minimal identity the header
 * dropdown and login selector need — never the full profile. `centreId` is the
 * per-center DB scope; `centerCode` (e.g. `CS-CASA-001`) is the tenant code;
 * `isActive` marks the currently-open center.
 *
 * These shapes mirror the fixed `center.*` IPC contract the backend implements
 * (SOU-94). They live here — not in `shared/ipc/contract` — because the backend
 * owns the contract additions and their main-side handlers; declaring the
 * channels here too would force the (exhaustive) main handler map to implement
 * them before the backend branch merges. At integration these become aliases of
 * the shared `CenterListItemDto` / `CurrentCenterDto`.
 */
export type CenterListItemView = {
  centreId: string;
  centerCode: string;
  displayName: string;
  isActive: boolean;
};

export type CurrentCenterView = {
  centreId: string;
  centerCode: string;
  displayName: string;
};

/**
 * The seam the center switcher talks to (SOU-96). Two implementations satisfy it:
 * the real bridge over `window.api` (wired at integration, below) and an
 * in-memory mock (`center-gateway.mock`) that lets the switcher be built and
 * demoed before the backend's `center.*` handlers land. Which one the app uses is
 * a one-line change in `center-gateway-instance`.
 */
export interface CenterGateway {
  list(): Promise<CenterListItemView[]>;
  current(): Promise<CurrentCenterView>;
  switchTo(centreId: string): Promise<void>;
}

/**
 * Production gateway over the preload `window.api` bridge. Each method maps to one
 * of the backend's fixed `center.*` channels (SOU-96); `switchTo` resolves only
 * once main confirms the live DB swap, and a rejected `center.switch`
 * (`PlanFeatureUnavailableError` on a locked plan, `CenterSwitchError` on a failed
 * open) rejects here so the mutation surfaces its error state.
 */
export const windowCenterGateway: CenterGateway = {
  list: async () => (await window.api.invoke('center.list', {})).centers,
  current: () => window.api.invoke('center.current', {}),
  switchTo: async (centreId) => {
    await window.api.invoke('center.switch', { centreId });
  },
};
