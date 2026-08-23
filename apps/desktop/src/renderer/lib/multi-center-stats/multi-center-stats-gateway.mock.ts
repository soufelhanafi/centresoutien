import type { MultiCenterStatsGateway } from './multi-center-stats-gateway';
import type { MultiCenterStatsViewModel } from './multi-center-stats-view';

const SEED_VIEW: MultiCenterStatsViewModel = {
  month: '2026-08',
  rows: [
    {
      centreId: 'ctr_casa_001',
      centerCode: 'CS-CASA-001',
      displayName: 'Centre Al Amal — Casablanca',
      revenueMad: 4_820_000,
      collectedMad: 4_100_000,
      studentCount: 182,
      unpaidRate: 0.1494,
      momGrowthPercent: 6.2,
      unavailable: false,
    },
    {
      centreId: 'ctr_rabat_002',
      centerCode: 'CS-RABAT-002',
      displayName: 'Centre Annajah — Rabat',
      revenueMad: 3_150_000,
      collectedMad: 3_150_000,
      studentCount: 120,
      unpaidRate: 0,
      momGrowthPercent: -3.5,
      unavailable: false,
    },
    {
      centreId: 'ctr_fes_003',
      centerCode: 'CS-FES-003',
      displayName: 'Centre Al Fajr — Fès',
      revenueMad: 0,
      collectedMad: 0,
      studentCount: 0,
      unpaidRate: null,
      momGrowthPercent: null,
      unavailable: true,
    },
  ],
  totals: {
    centerCount: 3,
    availableCenterCount: 2,
    revenueMad: 7_970_000,
    collectedMad: 7_250_000,
    studentCount: 302,
    unpaidRate: 0.0903,
  },
};

/**
 * In-memory stand-in for the `multiCenterStats.*` handlers (SOU-106). It returns a
 * three-center view — two readable, one `unavailable` — so the table's sorting,
 * filtering, and unavailable-row rendering are exercisable without the real
 * bridge. `print`/`export` are inert resolutions.
 */
export function createMockMultiCenterStatsGateway(
  view: MultiCenterStatsViewModel = SEED_VIEW,
): MultiCenterStatsGateway {
  return {
    get: async () => view,
    print: async () => undefined,
    export: async () => null,
  };
}

export const MOCK_MULTI_CENTER_STATS_VIEW = SEED_VIEW;
