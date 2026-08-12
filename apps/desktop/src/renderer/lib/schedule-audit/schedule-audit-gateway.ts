import type { StrandedSessionView } from './stranded-session-view';
import { ipcScheduleAuditGateway } from './ipc-schedule-audit-gateway';

/**
 * The seam the schedule-audit UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter swaps in
 * one place with no change to any component.
 *
 * ## Channels (SOU-201)
 * - `listOutsideHours` → `session.audit.outside-hours`
 *   (`{ sessionsOutsideEffectiveHours: StrandedSessionDto[] }`).
 * - `cancel` → `session.cancel` (req `{ id }`, res `{ ok: true }`) where `id` is
 *   the OCCURRENCE id (`ses_…`). Soft-deletes ONLY that one occurrence — the
 *   weekly template and its sibling dates stay untouched (CLAUDE.md §5).
 */
export interface ScheduleAuditGateway {
  listOutsideHours(): Promise<readonly StrandedSessionView[]>;
  cancel(id: string): Promise<void>;
}

export const scheduleAuditGateway: ScheduleAuditGateway = ipcScheduleAuditGateway;
