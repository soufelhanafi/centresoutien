import type { StrandedSessionView } from './stranded-session-view';
import { mockScheduleAuditGateway } from './mock-schedule-audit-gateway';

/**
 * The seam the schedule-audit UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter swaps in
 * one place with no change to any component.
 *
 * ## Contract status (SOU-201)
 * Both methods map to domain channels published on `feature/SOU-201-domain` but
 * not yet on this worktree's typed IPC contract, so the active gateway is the
 * mock. When that branch merges, swap the export below to the IPC adapter — one
 * line — and the shapes already match the final DTOs:
 *
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

/**
 * The active gateway: the interim mock. Swapping it for the real IPC adapter
 * once the SOU-201 domain channels ship is this one line.
 */
export const scheduleAuditGateway: ScheduleAuditGateway = mockScheduleAuditGateway;
