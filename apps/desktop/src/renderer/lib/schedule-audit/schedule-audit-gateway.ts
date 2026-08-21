import type { StrandedGroupView } from './stranded-session-view';
import { ipcScheduleAuditGateway } from './ipc-schedule-audit-gateway';

/**
 * The seam the schedule-audit UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter swaps in
 * one place with no change to any component.
 *
 * ## Channels (SOU-201, SOU-296)
 * - `listOutsideHours` → `session.audit.outside-hours`
 *   (`{ groups: StrandedSessionGroupDto[] }` — the domain already collapses
 *   occurrences into reason+weekday+resource groups).
 * - `cancel` → `session.cancel` (req `{ id }`, res `{ ok: true }`) where `id` is
 *   the OCCURRENCE id (`ses_…`). Soft-deletes ONLY that one occurrence — the
 *   weekly template and its sibling dates stay untouched (CLAUDE.md §5).
 */
export interface ScheduleAuditGateway {
  listOutsideHours(): Promise<readonly StrandedGroupView[]>;
  cancel(id: string): Promise<void>;
}

export const scheduleAuditGateway: ScheduleAuditGateway = ipcScheduleAuditGateway;
