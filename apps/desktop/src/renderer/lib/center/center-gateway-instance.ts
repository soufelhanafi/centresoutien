import type { CenterGateway } from './center-gateway';
import { windowCenterGateway } from './center-gateway';
import { createMockCenterGateway } from './center-gateway.mock';

/**
 * SOU-96 integration switch. The backend's `center.*` IPC handlers are the last
 * piece to land; until then the mock lets the switcher run. Set
 * `VITE_CENTER_GATEWAY=real` (or flip the fallback) once [BACKEND DONE] is merged
 * — a one-line swap, no component change, since both sides honor `CenterGateway`.
 */
const useRealGateway = import.meta.env['VITE_CENTER_GATEWAY'] === 'real';

export const centerGateway: CenterGateway = useRealGateway
  ? windowCenterGateway
  : createMockCenterGateway();
