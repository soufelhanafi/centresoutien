import type { DiscoveredHubView, HubGateway, HubHostingStatusView } from './hub-gateway';

const SEED_CENTERS: readonly DiscoveredHubView[] = [
  { name: 'Centre Al Amal — Casablanca', host: '192.168.1.24', port: 8787, centreId: 'ctr_casa_001', centerCode: 'CS-CASA-001' },
  { name: 'Centre Annajah — Rabat', host: '192.168.1.31', port: 8787, centreId: 'ctr_rabat_002', centerCode: 'CS-RABAT-002' },
];

/**
 * In-memory stand-in for the backend's `hub.*` handlers (SOU-318). It flips a
 * local hosting flag and answers discovery with a couple of seeded centers so the
 * hosting card and the join branch are exercisable without a real LAN. Swapped out
 * at integration by `hub-gateway-instance` pointing at `windowHubGateway`.
 */
export function createMockHubGateway(): HubGateway {
  let hosting: HubHostingStatusView = { hosting: false };

  return {
    hostingStatus: async () => hosting,
    enableHosting: async () => {
      hosting = { hosting: true, address: '192.168.1.10', port: 8787, token: 'A1B2-C3D4-E5F6' };
      return hosting;
    },
    disableHosting: async () => {
      hosting = { hosting: false };
    },
    discoverCenters: async () => SEED_CENTERS,
    joinCenter: async (request) => {
      const match = SEED_CENTERS.find((center) => center.centerCode === request.centerCode);
      return {
        centreId: match?.centreId ?? 'ctr_joined_001',
        centerCode: request.centerCode,
      };
    },
  };
}
