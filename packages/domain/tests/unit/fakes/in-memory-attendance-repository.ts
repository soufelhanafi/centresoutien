import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { AttendanceRecord, AttendanceRecordId } from '../../../src/entities/attendance-record';
import type { AttendanceRepository, AttendanceSummary } from '../../../src/ports/attendance-repository';
import type { SessionId } from '../../../src/entities/session';
import type { StudentId } from '../../../src/entities/student';
import type { DateRange } from '../../../src/value-objects/date-range';

/**
 * In-memory {@link AttendanceRepository} for unit tests. Reuses the shared
 * soft-delete base (tombstone-excluding reads, soft delete, no hard delete);
 * `saveMany` mirrors the SQLite adapter's single-transaction upsert semantics
 * with a plain loop over `save`.
 */
export class InMemoryAttendanceRepository
  extends InMemorySoftDeletableRepository<AttendanceRecordId, AttendanceRecord>
  implements AttendanceRepository
{
  async saveMany(records: readonly AttendanceRecord[]): Promise<void> {
    for (const record of records) {
      await this.save(record);
    }
  }

  async listBySession(sessionId: SessionId): Promise<readonly AttendanceRecord[]> {
    return this.all()
      .filter((row) => row.sessionId === sessionId)
      .sort((a, b) => a.studentId.localeCompare(b.studentId));
  }

  async summarizeForStudent(studentId: StudentId, range: DateRange): Promise<AttendanceSummary> {
    void studentId;
    void range;
    throw new Error('summarizeForStudent is not exercised by RecordSessionAttendance tests');
  }
}
