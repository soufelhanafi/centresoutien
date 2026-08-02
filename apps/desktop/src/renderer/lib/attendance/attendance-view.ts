import type { AttendanceStatus } from '@centresoutien/domain';
import type { AttendanceRecordDto } from '../../../shared/ipc/contract';

export type { AttendanceStatus };

/** The presentation projection of one `attendance.record` result — a direct alias
 *  of the boundary's `attendanceRecordViewSchema`, so the shape can never drift. */
export type AttendanceRecordView = AttendanceRecordDto;

/** One weekly recurring slot a group meets in, as needed to resolve which concrete
 *  dated `Session` a roll-call date belongs to (SOU-58: no dedicated roster-by-
 *  session read model — the roll-call screen composes `session.week` + `session.
 *  generate` + the existing `group.roster`). */
export type WeeklySlotOption = {
  readonly recurringSessionId: string;
  readonly dayOfWeek: number;
  readonly start: string;
  readonly end: string;
};

/** One student's chosen roll-call outcome, as submitted to `attendance.record`. */
export type RollCallRecordInput = {
  readonly studentId: string;
  readonly status: AttendanceStatus;
};
