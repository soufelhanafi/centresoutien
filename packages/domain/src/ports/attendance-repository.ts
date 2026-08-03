import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { AttendanceRecord, AttendanceRecordId, AttendanceStatus } from '../entities/attendance-record';
import type { GroupId } from '../entities/group';
import type { SessionId } from '../entities/session';
import type { StudentId } from '../entities/student';
import type { CenterCode } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';

/** Count of each {@link AttendanceStatus} across a queried window — the per-student aggregate. */
export type AttendanceSummary = Readonly<Record<AttendanceStatus, number>>;

/**
 * One attendance record joined to its concrete dated session, as consumed by the
 * per-student history read (SOU-108). `date`/`groupId` come from `sessions`;
 * `status`/`note` from `attendance_records`. Chronological ordering (`date`
 * ascending) is guaranteed by the adapter.
 */
export type StudentAttendanceReading = {
  readonly sessionId: SessionId;
  readonly date: string; // strict 'YYYY-MM-DD'
  readonly groupId: GroupId | null;
  readonly status: AttendanceStatus;
  readonly note: string | null;
};

/** One (student, session, status) cell of a per-group sheet (SOU-108). */
export type GroupAttendanceCellReading = {
  readonly studentId: StudentId;
  readonly sessionId: SessionId;
  readonly date: string;
  readonly status: AttendanceStatus;
};

/**
 * The two halves of a per-group attendance sheet assembled by the adapter in a
 * single read: the group's live sessions in the range (columns) plus the live
 * attendance cells covering them (rows are derived by the use case from the
 * distinct `studentId`s). `sessions`/`cells` both rank by `date` ascending.
 */
export type GroupSheetData = {
  readonly sessions: readonly { readonly sessionId: SessionId; readonly date: string }[];
  readonly cells: readonly GroupAttendanceCellReading[];
};

/**
 * Persistence port for {@link AttendanceRecord}. Extends the soft-deletable
 * surface (`save` / `findById` / `softDelete` / `listChangedSince`; reads
 * exclude tombstones, no hard delete) with the two aggregate reads this ticket
 * exists to unblock: the per-session roll-call roster (SOU-58) and the
 * per-student summary (SOU-100's attendance-rate widget, SOU-108's absence
 * reporting).
 *
 * `save` is the single-record write — attendance is mutable (roll-call
 * corrections), not append-only, so there is no natural-key upsert here: the
 * caller (`RecordSessionAttendance`, SOU-58) looks up the existing records for
 * a session via {@link listBySession} before deciding, per student, whether to
 * create or edit in place. Attendance records are identified by their
 * relationships, not people-like matching, so there is no `findByNaturalKey`.
 *
 * SOU-108's reporting reads (`listForStudent`, `sheetForGroup`) are read-model
 * joins onto `sessions` — one aggregate query each, never a read per student.
 */
export interface AttendanceRepository
  extends SoftDeletableRepository<AttendanceRecordId, AttendanceRecord> {
  /** Live records for one session, ordered by `studentId` — the roll-call roster. */
  listBySession(sessionId: SessionId): Promise<readonly AttendanceRecord[]>;

  /**
   * Upsert an entire session's roll-call in one transaction (SOU-58): the
   * batched write behind `RecordSessionAttendance`, so marking a 20-student
   * roster takes one round trip, not N. Each record is written as given — the
   * use case has already resolved create-vs-edit-in-place per student, so this
   * is a pure persistence batch, not a decision point.
   */
  saveMany(records: readonly AttendanceRecord[]): Promise<void>;

  /**
   * Count of each status a student accrued across sessions whose `date` falls
   * in the inclusive `range`, live records only. Every {@link AttendanceStatus}
   * is present in the result, defaulting to 0 — never a partial map — so
   * callers can index it directly without a fallback. Joins against `sessions`
   * internally (an `AttendanceRecord` carries no date of its own); scoped to
   * one center by construction, since a session never crosses centers.
   */
  summarizeForStudent(studentId: StudentId, range: DateRange): Promise<AttendanceSummary>;

  /**
   * Count of each status across the **whole center's** live records whose
   * session falls in `range`, live sessions only — the SOU-100 dashboard's
   * attendance-rate widget. Same shape and every-status-present guarantee as
   * {@link summarizeForStudent}, just scoped by center instead of student, so
   * it costs one aggregate query regardless of headcount (never one read per
   * student — the <500ms/500-student acceptance target).
   */
  summarizeForCenter(centerCode: CenterCode, range: DateRange): Promise<AttendanceSummary>;

  /**
   * SOU-108: a student's live attendance rows joined to their concrete session
   * (`date`, `groupId`), live sessions only, `date` across the inclusive
   * `range`, ordered chronologically (`date` asc, then `sessionId`). One
   * aggregate query — never a read per session.
   */
  listForStudent(studentId: StudentId, range: DateRange): Promise<readonly StudentAttendanceReading[]>;

  /**
   * SOU-108: the two halves of a permanent per-group attendance sheet in one
   * read — the group's live sessions in `range` (`sessionId` + `date`) and the
   * live attendance cells covering them (student × session × status), both
   * ranked by `date` ascending. Live sessions membership is the concrete
   * `sessions.groupId` (SOU-130); live records exclude tombstones on both sides.
   */
  sheetForGroup(groupId: GroupId, range: DateRange): Promise<GroupSheetData>;
}

