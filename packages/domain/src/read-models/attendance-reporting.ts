import type { AttendanceStatus } from '../entities/attendance-record';
import type { GroupId } from '../entities/group';
import type { SessionId } from '../entities/session';
import type { StudentId } from '../entities/student';

/**
 * Read models for SOU-108 attendance reporting. All three are **cross-aggregate
 * read models** (like `dashboard-advanced-summary`), not entities: no sync
 * envelope, referenced relationships carried as ids (never fanned into domain
 * entities), and never written back. Produced by `GetStudentAttendanceReport`
 * and `GetGroupAttendanceSheet` from `AttendanceRepository` aggregate reads.
 */

/**
 * One session's roll-call outcome for a student, as it crosses into a report —
 * the attendance record joined to its concrete dated `Session`. `date`/`groupId`
 * come from the session (SOU-130 added `groupId` to the concrete row); `note`
 * is the record's own free-text. Filtered to the requested month and optionally
 * a single group.
 */
export type StudentAttendanceRow = {
  readonly sessionId: SessionId;
  readonly date: string;
  readonly groupId: GroupId | null;
  readonly groupName: { readonly fr: string; readonly ar: string } | null;
  readonly status: AttendanceStatus;
  readonly note: string | null;
};

/** Per-status count of a report window — the same shape `AttendanceSummary` uses. */
export type AttendanceStatusCounts = Readonly<Record<AttendanceStatus, number>>;

/**
 * A student's absence summary over the report window — what a parent-as-conversation
 * view needs at a glance:
 *
 * - `attendanceRatePercent`: `present` as a share of every roll-call outcome,
 *   rounded — the exact formula the SOU-100 dashboard attendance-rate widget
 *   uses, so the number is consistent wherever it appears. `0` when no records.
 * - `consecutiveAbsences`: the longest run of date-ordered statuses in the
 *   window that count toward an absence streak (`absent` **or** `late`;
 *   `present`/`excused` break the run — SOU-108 KICKOFF decision).
 * - `hasAbsenceStreak`: `consecutiveAbsences >= 3` — the presentation flag.
 * - `counts`: every status, always present (never a partial map).
 */
export type AttendanceAbsenceSummary = {
  readonly attendanceRatePercent: number;
  readonly consecutiveAbsences: number;
  readonly hasAbsenceStreak: boolean;
  readonly counts: AttendanceStatusCounts;
};

/** The student-detail Attendance tab payload: chronological history + absence summary. */
export type StudentAttendanceReport = {
  readonly studentId: StudentId;
  readonly history: readonly StudentAttendanceRow[];
  readonly summary: AttendanceAbsenceSummary;
};

/**
 * A printable per-group attendance sheet for a month: one row per enrolled (here:
 * recorded) student, one column per live session of that group, cells populated
 * with the status when a record exists and `null` otherwise. `cells` is **parallel
 * to `sessions`** by index, so the renderer/PDF can lay out a straight grid.
 * `Students` are the distinct students who have at least one live record in the
 * window (read-model only — the sheet reflects recorded attendance).
 */
export type GroupAttendanceSheet = {
  readonly groupId: GroupId;
  readonly sessions: readonly { readonly sessionId: SessionId; readonly date: string }[];
  readonly students: readonly {
    readonly studentId: StudentId;
    readonly name: { readonly fr: string; readonly ar: string };
    readonly cells: ReadonlyArray<AttendanceStatus | null>;
  }[];
};
