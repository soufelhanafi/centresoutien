import type { MultiCenterStatsViewModel } from './multi-center-stats-view';
import { ipcMultiCenterStatsGateway } from './ipc-multi-center-stats-gateway';

/**
 * The seam the per-center stats UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter — and the
 * in-memory mock the tests use — swap in one place with no change to any
 * component (SOU-106).
 *
 * Every method is Premium-gated in the domain (`org.multi-center`): a non-Premium
 * plan rejects with `PlanFeatureUnavailableError`. The UI gates the whole screen
 * with `useFeature`, so that rejection is only a safety net.
 */
export interface MultiCenterStatsGateway {
  /** The current-month per-center comparison (month is Clock-derived in main). */
  get(): Promise<MultiCenterStatsViewModel>;
  /** Renders the FR/AR PDF and opens it in the OS viewer. */
  print(locale: 'fr' | 'ar'): Promise<void>;
  /** Renders the FR/AR PDF to a user-picked path; resolves to `null` if cancelled. */
  export(locale: 'fr' | 'ar'): Promise<string | null>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const multiCenterStatsGateway: MultiCenterStatsGateway = ipcMultiCenterStatsGateway;
