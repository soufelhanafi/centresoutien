import type { DayCloseReport } from './day-close-report';
import { ipcDayCloseGateway } from './ipc-day-close-gateway';

/**
 * The seam the "Clôture du jour" UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place. `centerCode` is injected in the main process, never sent from the
 * renderer; the report is FR-only, so there is no `locale`.
 */
export interface DayCloseGateway {
  /** The composed end-of-day report for a single `'YYYY-MM-DD'` business day. */
  getReport(day: string): Promise<DayCloseReport>;
  /** Renders the FR-only report PDF and opens it in the OS's default viewer. */
  print(day: string): Promise<void>;
  /**
   * Renders the FR-only report PDF and lets the user pick a save location.
   * `savedPath` is `null` when the save dialog was cancelled.
   */
  export(day: string): Promise<{ savedPath: string | null }>;
}

/** The active gateway. */
export const dayCloseGateway: DayCloseGateway = ipcDayCloseGateway;
