import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { SESSION_ID_PREFIX } from '../entities/session';
import { STUDENT_ID_PREFIX } from '../entities/student';
import { ATTENDANCE_STATUSES } from '../entities/attendance-record';

/**
 * Input schema for `RecordSessionAttendance` — the batched roll-call submission
 * for one session (SOU-58). The envelope (deviceOrigin, updatedBy) and
 * centerCode are stamped by main, never sent by the renderer.
 *
 * `sessionId` / each `studentId` are checked for their id prefix only; that they
 * resolve to a live, same-center row is the use case's job (a schema is pure and
 * entity-local). `records` must be non-empty (an empty roll-call is a no-op the
 * renderer should never submit) and carry no duplicate `studentId` — the use
 * case processes the batch in one transaction, so a duplicate would silently
 * apply the last write and hide a client bug.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each via `t(\`errors.${code}\`)`.
 */
const sessionRef = z
  .string()
  .refine((value) => hasIdPrefix(value, SESSION_ID_PREFIX), { message: 'invalid-id' });

const studentRef = z
  .string()
  .refine((value) => hasIdPrefix(value, STUDENT_ID_PREFIX), { message: 'invalid-id' });

const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

export const recordSessionAttendanceSchema = z
  .object({
    sessionId: sessionRef,
    records: z
      .array(
        z.object({
          studentId: studentRef,
          status: attendanceStatusSchema,
        }),
      )
      .min(1, { message: 'empty-roster' }),
  })
  .refine(
    (v) => new Set(v.records.map((record) => record.studentId)).size === v.records.length,
    { message: 'duplicate-student', path: ['records'] },
  );

export type RecordSessionAttendanceRequest = z.infer<typeof recordSessionAttendanceSchema>;
