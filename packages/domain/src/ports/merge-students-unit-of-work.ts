import type { AttendanceRecord } from '../entities/attendance-record';
import type { Enrollment } from '../entities/enrollment';
import type { Invoice } from '../entities/invoice';
import type { MergeLogEntry } from '../entities/merge-log';
import type { Student, StudentId } from '../entities/student';
import type { StudentSubscription } from '../entities/student-subscription';
import type { CenterCode } from '../value-objects/ids';

/**
 * The narrow, atomic seam for {@link import('../use-cases/merge-students').MergeStudents}.
 *
 * A student merge must re-point every dependent row that referenced the loser
 * onto the winner — enrollments, subscriptions, attendance records and invoices —
 * plus write the loser tombstone and the audit {@link MergeLogEntry}. The use case
 * reads the loser's dependents through `listDependents`, re-points them with a
 * pure domain transform, and hands the whole computed unit to `commit` — ONE
 * method — so the SQLite adapter (SOU-90) persists everything in a single
 * transaction. A failure at any step rolls the merge back completely (SOU-169).
 *
 * Payments are deliberately ABSENT from this port: they reference an `invoiceId`,
 * never a `studentId`, and are append-only — a student merge re-points the
 * invoice header, never its ledger. Probable double-entries are flagged in the
 * conflicts inbox, not merged.
 */
export type StudentDependents = {
  readonly enrollments: readonly Enrollment[];
  readonly subscriptions: readonly StudentSubscription[];
  readonly attendance: readonly AttendanceRecord[];
  readonly invoices: readonly Invoice[];
};

export type MergeStudentsUnit = {
  readonly winner: Student;
  readonly loser: Student;
  readonly repointed: StudentDependents;
  readonly mergeLog: MergeLogEntry;
};

export interface MergeStudentsUnitOfWork {
  /** Every live dependent row of the loser student that a merge must re-point. */
  listDependents(centerCode: CenterCode, loserId: StudentId): Promise<StudentDependents>;
  /**
   * Every live (non-tombstoned) subscription held by the given students,
   * INCLUDING already-closed ones (`endMonth` set) — the caller filters for open
   * rows. This is the BOTH-sides read `MergeStudents` needs to reconcile active
   * subscriptions after re-pointing: re-pointing the loser's live subscription
   * onto a winner who already holds an open same-kind subscription would violate
   * the at-most-one-active-per-kind invariant and bill twice (CLAUDE.md §7). The
   * use case closes the loser-origin duplicates in the same unit as the merge.
   */
  listLiveSubscriptions(
    centerCode: CenterCode,
    studentIds: readonly StudentId[],
  ): Promise<readonly StudentSubscription[]>;
  /** Persist the whole merge atomically. Must not partially apply on failure. */
  commit(unit: MergeStudentsUnit): Promise<void>;
}
