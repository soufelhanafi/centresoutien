import type { HubGateway } from './hub-gateway';
import { windowHubGateway } from './hub-gateway';
import { createMockHubGateway } from './hub-gateway.mock';

/**
 * SOU-318 gateway selection. The real `window.api` bridge is the default;
 * `VITE_HUB_GATEWAY=mock` opts into the in-memory gateway for isolated UI runs
 * without a LAN. Either side honors `HubGateway`, so this stays a one-line swap
 * with no component change.
 */
const useMockGateway = import.meta.env['VITE_HUB_GATEWAY'] === 'mock';

export const hubGateway: HubGateway = useMockGateway ? createMockHubGateway() : windowHubGateway;
