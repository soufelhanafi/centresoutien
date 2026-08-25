/**
 * The renderer's seam to the LAN hub IPC surface (SOU-318). The host side
 * designates this device as the center's hub (`hostingStatus` / `enableHosting` /
 * `disableHosting`); the client side browses the LAN for a hub and joins one
 * (`discoverCenters` / `joinCenter`). These view shapes mirror the fixed `hub.*`
 * IPC contract (`shared/ipc/hub-contract`); at build time they are the exact
 * request/response shapes the typed `window.api.invoke` enforces.
 */

export type HubHostingStatusView =
  | { hosting: false }
  | { hosting: true; address: string; port: number; token: string };

/** One hub found during a LAN browse: the center's identity plus where it lives. */
export type DiscoveredHubView = {
  name: string;
  host: string;
  port: number;
  centreId: string;
  centerCode: string;
};

/** What a successful join returns: the joined center's scope + tenant code. */
export type JoinCenterResultView = {
  centreId: string;
  centerCode: string;
};

/** The address + token a joining device needs to pair with a discovered hub. */
export type JoinCenterRequest = {
  baseUrl: string;
  token: string;
  centerCode: string;
};

/**
 * The seam the hosting card and the first-run join branch talk to. Two
 * implementations satisfy it: the real bridge over `window.api` and an in-memory
 * mock (`hub-gateway.mock`) that lets the UI be exercised without a LAN. Which one
 * the app uses is a one-line change in `hub-gateway-instance`.
 */
export interface HubGateway {
  hostingStatus(): Promise<HubHostingStatusView>;
  enableHosting(): Promise<HubHostingStatusView>;
  disableHosting(): Promise<void>;
  discoverCenters(): Promise<readonly DiscoveredHubView[]>;
  joinCenter(request: JoinCenterRequest): Promise<JoinCenterResultView>;
}

/**
 * Production gateway over the preload `window.api` bridge. Each method maps to one
 * of the fixed `hub.*` channels; a rejected call (a `center-join-failed` domain
 * error, a missing-LAN error, or a plan gate) rejects here so the calling mutation
 * surfaces its error state.
 */
export const windowHubGateway: HubGateway = {
  hostingStatus: () => window.api.invoke('hub.hostingStatus', {}),
  enableHosting: () => window.api.invoke('hub.enableHosting', {}),
  disableHosting: async () => {
    await window.api.invoke('hub.disableHosting', {});
  },
  discoverCenters: async () => (await window.api.invoke('hub.discoverCenters', {})).centers,
  joinCenter: async (request) => {
    const { centreId, centerCode } = await window.api.invoke('hub.joinCenter', request);
    return { centreId, centerCode };
  },
};
