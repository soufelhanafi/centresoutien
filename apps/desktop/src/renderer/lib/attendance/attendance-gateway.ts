import type { AttendanceRecordView, RollCallRecordInput, WeeklySlotOption } from './attendance-view';
import { ipcAttendanceGateway } from './ipc-attendance-gateway';

/**
 * The seam the roll-call UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-58)
 *
 * `attendance.record` is the only channel this ticket added. There is no
 * roster-by-session or session-by-date read model, so this gateway composes
 * three existing channels: `session.week` to find the group's weekly slots,
 * `session.generate` to resolve (or idempotently materialize) the concrete
 * dated `Session` for the chosen date, and `attendance.record` to submit the
 * whole roster in one batched write. The roster itself comes from
 * `group.roster` via `GroupsGateway.roster` — this gateway never re-reads it.
 */
export interface AttendanceGateway {
  /** Every live weekly slot the group meets in, any weekday. */
  weeklySlotsForGroup(groupId: string): Promise<readonly WeeklySlotOption[]>;
  /** Resolves (materializing if needed) the concrete session for one slot + date. */
  resolveSession(recurringSessionId: string, date: string): Promise<{ sessionId: string }>;
  /** One batched roll-call write for the whole roster. */
  submit(
    sessionId: string,
    records: readonly RollCallRecordInput[],
  ): Promise<readonly AttendanceRecordView[]>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const attendanceGateway: AttendanceGateway = ipcAttendanceGateway;
