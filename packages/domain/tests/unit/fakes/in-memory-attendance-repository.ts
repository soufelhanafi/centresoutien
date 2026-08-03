import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import { ATTENDANCE_STATUSES } from '../../../src/entities/attendance-record';
import type {
  AttendanceRecord,
  AttendanceRecordId,
  AttendanceStatus,
} from '../../../src/entities/attendance-record';
import type { AttendanceRepository, AttendanceSummary, StudentAttendanceReading, GroupSheetData } from '../../../src/ports/attendance-repository';
import type { SessionId } from '../../../src/entities/session';
import type { StudentId } from '../../../src/entities/student';
import type { GroupId } from '../../../src/entities/group';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { DateRange } from '../../../src/value-objects/date-range';

function emptySummary(): Record<AttendanceStatus, number> {
  const summary = {} as Record<AttendanceStatus, number>;
  for (const status of ATTENDANCE_STATUSES) summary[status] = 0;
  return summary;
}

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

  private centerSummary: AttendanceSummary | null = null;

  /**
   * test-only convenience: seed the adapter-computed aggregate `summarizeForCenter`
   * returns — the join against `sessions.date` is the SQLite adapter's concern
   * (proven in its integration test), not this in-memory fake's, mirroring
   * `InMemoryInvoiceRepository.setNetPaid`.
   */
  setCenterSummary(summary: Partial<AttendanceSummary>): void {
    this.centerSummary = { ...emptySummary(), ...summary };
  }

  async summarizeForCenter(centerCode: CenterCode, range: DateRange): Promise<AttendanceSummary> {
    void centerCode;
    void range;
    return this.centerSummary ?? emptySummary();
  }

  private studentReadings = new Map<StudentId, readonly StudentAttendanceReading[]>();

  /** test-only seeding for `listForStudent` — range-filtering/joins are the SQLite adapter's concern. */
  setStudentReadings(studentId: StudentId, readings: readonly StudentAttendanceReading[]): void {
    this.studentReadings.set(studentId, readings);
  }

  async listForStudent(studentId: StudentId, range: DateRange): Promise<readonly StudentAttendanceReading[]> {
    void range;
    return this.studentReadings.get(studentId) ?? [];
  }

  private groupSheets = new Map<GroupId, GroupSheetData>();

  /** test-only seeding for `sheetForGroup` — range-filtering/joins are the SQLite adapter's concern. */
  setGroupSheet(groupId: GroupId, data: GroupSheetData): void {
    this.groupSheets.set(groupId, data);
  }

  async sheetForGroup(groupId: GroupId, range: DateRange): Promise<GroupSheetData> {
    void range;
    return this.groupSheets.get(groupId) ?? { sessions: [], cells: [] };
  }
}
