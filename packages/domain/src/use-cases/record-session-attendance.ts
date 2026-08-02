import type { AttendanceRepository } from '../ports/attendance-repository';
import type { SessionRepository } from '../ports/session-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import {
  ATTENDANCE_RECORD_ID_PREFIX,
  type AttendanceRecord,
  type AttendanceRecordId,
} from '../entities/attendance-record';
import type { SessionId } from '../entities/session';
import type { StudentId } from '../entities/student';
import { recordSessionAttendanceSchema } from '../schemas/attendance';
import { SessionNotFoundError } from '../errors/scheduling-errors';

export type RecordSessionAttendanceInput = {
  sessionId: string;
  records: readonly { studentId: string; status: string }[];
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Records a whole session's roll-call in one batch (SOU-58): one transaction,
 * one IPC round trip for the entire roster, not N calls per student — the
 * "under 30 seconds for 20 students" done-criterion is a persistence-shape
 * requirement as much as a UI one. Gated by `core.attendance` (base tier).
 *
 * Order of work:
 *  1. Gate on `core.attendance`.
 *  2. Validate with `recordSessionAttendanceSchema` (id prefixes, non-empty
 *     roster, no duplicate `studentId` within the batch).
 *  3. Resolve `sessionId` to a live session **of the same center**
 *     ({@link SessionNotFoundError}) — a stale or foreign-center session id
 *     never silently records attendance nobody can see.
 *  4. Load the session's existing live records ({@link
 *     AttendanceRepository.listBySession}) and index them by `studentId`. Per
 *     submitted record: a matching existing row is edited in place (`status`,
 *     `updatedAt`, `updatedBy` — identity fields untouched, the same-day
 *     roll-call correction path); no match mints a fresh record with its own
 *     envelope.
 *  5. Persist the whole batch via {@link AttendanceRepository.saveMany}.
 *
 * `note` is out of scope for this ticket (KICKOFF) — every record is written
 * with `note: null`, including corrections to a record that once had one, since
 * there is no per-field note input to preserve here.
 */
export class RecordSessionAttendance {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: RecordSessionAttendanceInput): Promise<readonly AttendanceRecord[]> {
    this.plan.require('core.attendance');
    const fields = recordSessionAttendanceSchema.parse(input);

    const sessionId = fields.sessionId as SessionId;
    const session = await this.sessions.findById(sessionId);
    if (session === null || session.centerCode !== input.centerCode) {
      throw new SessionNotFoundError(sessionId);
    }

    const existingByStudent = new Map<StudentId, AttendanceRecord>();
    for (const record of await this.attendance.listBySession(sessionId)) {
      existingByStudent.set(record.studentId, record);
    }

    const now = this.clock.now();
    const results = fields.records.map((entry): AttendanceRecord => {
      const studentId = entry.studentId as StudentId;
      const existing = existingByStudent.get(studentId);
      if (existing) {
        return {
          ...existing,
          status: entry.status,
          note: null,
          updatedAt: now,
          updatedBy: input.updatedBy,
        };
      }
      return {
        id: this.ids.next(ATTENDANCE_RECORD_ID_PREFIX) as AttendanceRecordId,
        ...newEnvelope(
          {
            centerCode: input.centerCode,
            deviceOrigin: input.deviceOrigin,
            updatedBy: input.updatedBy,
          },
          this.clock,
        ),
        sessionId,
        studentId,
        status: entry.status,
        note: null,
      };
    });

    await this.attendance.saveMany(results);
    return results;
  }
}
