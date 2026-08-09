import type { CenterGateway } from './center-gateway';
import { windowCenterGateway } from './center-gateway';
import { createMockCenterGateway } from './center-gateway.mock';

/**
 * SOU-96 gateway selection. The real `window.api` bridge is the default now that
 * the backend's `center.*` handlers have landed; `VITE_CENTER_GATEWAY=mock` opts
 * into the in-memory gateway for isolated UI runs. Either side honors
 * `CenterGateway`, so this stays a one-line swap with no component change.
 */
const useMockGateway = import.meta.env['VITE_CENTER_GATEWAY'] === 'mock';

export const centerGateway: CenterGateway = useMockGateway
  ? createMockCenterGateway()
  : windowCenterGateway;
