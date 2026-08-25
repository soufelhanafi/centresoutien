import type { RecurringSlotWarningView, StrandedGroupView } from './stranded-session-view';
import { ipcScheduleAuditGateway } from './ipc-schedule-audit-gateway';

export type ScheduleAuditResult = {
  readonly groups: readonly StrandedGroupView[];
  readonly recurringSlotWarnings: readonly RecurringSlotWarningView[];
};

/**
 * The seam the schedule-audit UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter swaps in
 * one place with no change to any component.
 *
 * ## Channels (SOU-201, SOU-296, SOU-296bis)
 * - `listOutsideHours` → `session.audit.outside-hours`
 *   (`{ groups: StrandedSessionGroupDto[], recurringSlotWarnings: StrandedRecurringSlotDto[] }`
 *   — the domain already collapses occurrences into reason+weekday+resource
 *   groups; `recurringSlotWarnings` are un-materialized weekly templates a
 *   teacher-availability edit now strands).
 * - `cancel` → `session.cancel` (req `{ id }`, res `{ ok: true }`) where `id` is
 *   the OCCURRENCE id (`ses_…`). Soft-deletes ONLY that one occurrence — the
 *   weekly template and its sibling dates stay untouched (CLAUDE.md §5).
 */
export interface ScheduleAuditGateway {
  listOutsideHours(): Promise<ScheduleAuditResult>;
  cancel(id: string): Promise<void>;
}

export const scheduleAuditGateway: ScheduleAuditGateway = ipcScheduleAuditGateway;
