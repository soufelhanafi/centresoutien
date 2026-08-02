import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { SessionId } from './session';
import type { StudentId } from './student';

/** ULID id prefix for attendance records: `att_01HW…`. */
export const ATTENDANCE_RECORD_ID_PREFIX = 'att';

export type AttendanceRecordId = Brand<string, 'AttendanceRecordId'>;

/** The four roll-call outcomes a student can have for one session. */
export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused', 'late'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * One student's roll-call outcome for one concrete {@link Session} (CLAUDE.md
 * §6/§9 precedent: entities that record what happened, not what's owed).
 * Attendance never affects invoicing — billing is monthly, per
 * `StudentSubscription`, regardless of who showed up.
 *
 * Natural identity is `(sessionId, studentId)` — at most one record per student
 * per session — but unlike {@link import('./session').Session}'s
 * `(recurringSessionId, date)` generator-idempotency key, this pair is **not** a
 * DB-level UNIQUE constraint: two laptops taking roll-call for the same session
 * before a sync must converge on sync-resolve rather than reject the push (same
 * rationale as `Enrollment`'s missing `(studentId, groupId)` unique). Duplicate
 * prevention for this pair lives in the domain, in the future `RecordAttendance`
 * use case (SOU-58 pairing), not the schema.
 *
 * **Mutable, not append-only** — unlike `Payment`. Same-day roll-call
 * corrections (marked absent, actually present) edit `status` / `note` on the
 * existing row rather than appending a new one; there is no ledger to sum.
 *
 * Not people-like — identified by its relationships, not a matching key — so it
 * carries no `naturalKey`. Soft-delete only: removing a record (e.g. the session
 * itself was cancelled) sets `deletedAt`; a tombstoned row still syncs.
 */
export type AttendanceRecord = EntityEnvelope & {
  readonly id: AttendanceRecordId;
  readonly sessionId: SessionId;
  readonly studentId: StudentId;
  status: AttendanceStatus;
  note: string | null;
};
