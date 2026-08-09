import type { CenterGateway, CenterListItemView, CurrentCenterView } from './center-gateway';

type MockCenter = Omit<CenterListItemView, 'isActive'>;

const SEED_CENTERS: readonly MockCenter[] = [
  { centreId: 'ctr_casa_001', centerCode: 'CS-CASA-001', displayName: 'Centre Al Amal — Casablanca' },
  { centreId: 'ctr_rabat_002', centerCode: 'CS-RABAT-002', displayName: 'Centre Annajah — Rabat' },
];

/**
 * In-memory stand-in for the backend's `center.*` handlers (SOU-96). It holds a
 * couple of centers and a mutable "active" pointer so the switcher's full flow —
 * list, current, switch — is exercisable before the real bridge exists. Swapped
 * out at integration by `center-gateway-instance` pointing at `windowCenterGateway`.
 */
export function createMockCenterGateway(): CenterGateway {
  const centers = SEED_CENTERS;
  let activeCentreId = centers[0]?.centreId ?? '';

  const resolveCurrent = (): CurrentCenterView => {
    const active = centers.find((center) => center.centreId === activeCentreId) ?? centers[0];
    if (!active) {
      throw new Error('center-gateway-mock: no seeded center');
    }
    return { centreId: active.centreId, centerCode: active.centerCode, displayName: active.displayName };
  };

  return {
    list: async () =>
      centers.map((center) => ({ ...center, isActive: center.centreId === activeCentreId })),
    current: async () => resolveCurrent(),
    switchTo: async (centreId) => {
      if (!centers.some((center) => center.centreId === centreId)) {
        throw new Error('center-gateway-mock: unknown center');
      }
      activeCentreId = centreId;
    },
  };
}
