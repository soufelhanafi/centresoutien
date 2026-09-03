import type { JoinCenter, PlanPolicy } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { HubHostingService } from '../hub-discovery/hub-hosting';
import type { HubDiscovererPort } from '../hub-discovery/hub-service';

/** How long `hub.discoverCenters` browses the LAN before answering. Long enough
 *  for hubs to respond to the multicast query, short enough to feel instant. */
const DISCOVERY_WINDOW_MS = 2500;

export type HubHandlerDeps = {
  /** Domain plan gate — every hub channel requires `sync.multi-device` before it
   *  touches config or the network (CLAUDE.md §4 rule 1). Shared with the sync
   *  handlers' `plan`. */
  plan: Pick<PlanPolicy, 'require'>;
  /** Designates/undesignates THIS center's device as its hub; null only in wirings
   *  that don't support hosting (never in the packaged app). */
  hubHosting: HubHostingService | null;
  /** Browses the LAN for hubs to join; null when no mDNS adapter is wired. */
  hubDiscoverer: HubDiscovererPort | null;
  /** Restarts the app so a just-changed hosting config takes effect — the embedded
   *  hub + its mDNS advertisement come up from config on boot. */
  requestHubRestart: () => void;
  /** Cold-bootstraps a local replica of a discovered center and switches into it.
   *  Structural (`Pick`) like the sync handlers' engine, so it fakes cleanly. */
  joinCenter: Pick<JoinCenter, 'execute'>;
};

/**
 * Hub hosting + discovery IPC (SOU-318). Enabling/disabling hosting is a config
 * write followed by a restart (the hub starts from config on boot); the response
 * carries the pairing token so the host UI can show it before the restart lands.
 * Discovery is a time-boxed LAN browse. All conflict/merge semantics stay in the
 * domain — these handlers only designate a role and enumerate responders.
 */
export function createHubHandlers(deps: HubHandlerDeps): Pick<
  IpcHandlers,
  'hub.hostingStatus' | 'hub.enableHosting' | 'hub.disableHosting' | 'hub.discoverCenters' | 'hub.joinCenter'
> {
  return {
    'hub.hostingStatus': () => {
      deps.plan.require('sync.multi-device');
      return deps.hubHosting?.status() ?? { hosting: false };
    },
    'hub.enableHosting': () => {
      deps.plan.require('sync.multi-device');
      if (deps.hubHosting === null) return { hosting: false };
      const status = deps.hubHosting.enable();
      deps.requestHubRestart();
      return status;
    },
    'hub.disableHosting': () => {
      deps.plan.require('sync.multi-device');
      deps.hubHosting?.disable();
      deps.requestHubRestart();
      return { ok: true };
    },
    'hub.discoverCenters': async () => {
      deps.plan.require('sync.multi-device');
      const centers = deps.hubDiscoverer === null ? [] : await deps.hubDiscoverer.discover(DISCOVERY_WINDOW_MS);
      return { centers: centers.map((center) => ({ ...center, hosts: [...center.hosts] })) };
    },
    // The use case owns the `sync.multi-device` gate + the cold-bootstrap + the
    // switch-in (and its rollback); the handler only forwards the discovered
    // target + the human-entered token.
    'hub.joinCenter': (request) =>
      deps.joinCenter.execute({
        baseUrls: request.baseUrls,
        token: request.token,
        centerCode: request.centerCode,
      }),
  };
}
