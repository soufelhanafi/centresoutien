import type { Database as DB } from 'better-sqlite3';
import type {
  AttendanceRecord,
  AttendanceRecordId,
  AttendanceRepository,
  AttendanceStatus,
  AttendanceSummary,
  CenterCode,
  DeviceId,
  SessionId,
  StudentId,
  UserId,
  DateRange,
} from '@centresoutien/domain';
import { ATTENDANCE_STATUSES } from '@centresoutien/domain';

/** The `attendance_records` row shape as SQLite returns it. */
type AttendanceRecordRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  session_id: string;
  student_id: string;
  status: string;
  note: string | null;
};

function fromRow(row: AttendanceRecordRow): AttendanceRecord {
  return {
    id: row.id as AttendanceRecordId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    sessionId: row.session_id as SessionId,
    studentId: row.student_id as StudentId,
    status: row.status as AttendanceStatus,
    note: row.note,
  };
}

function toParams(record: AttendanceRecord): Record<string, string | number | null> {
  return {
    id: record.id,
    center_code: record.centerCode,
    device_origin: record.deviceOrigin,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    updated_by: record.updatedBy,
    deleted_at: record.deletedAt ? record.deletedAt.toISOString() : null,
    version: record.version,
    session_id: record.sessionId,
    student_id: record.studentId,
    status: record.status,
    note: record.note,
  };
}

const COLUMNS = `
  (id, center_code, device_origin, created_at, updated_at, updated_by,
   deleted_at, version, session_id, student_id, status, note)`;

const VALUES = `
  (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
   @deleted_at, @version, @session_id, @student_id, @status, @note)`;

// Upsert on the ULID `id` — a same-day roll-call correction saves the same id
// again with a new status/note. Identity columns (id, center_code,
// device_origin, created_at, session_id, student_id) are never rewritten.
const SAVE_SQL = `
  INSERT INTO attendance_records ${COLUMNS}
  VALUES ${VALUES}
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    status     = excluded.status,
    note       = excluded.note
`;

function emptySummary(): Record<AttendanceStatus, number> {
  const summary = {} as Record<AttendanceStatus, number>;
  for (const status of ATTENDANCE_STATUSES) summary[status] = 0;
  return summary;
}

/**
 * SQLite adapter for {@link AttendanceRepository}. Pure translation between the
 * port and SQL — no business decisions. Reads hide tombstones; `listChangedSince`
 * (the sync feed) deliberately sees them. `centerCode` is injected by the caller
 * (main); this adapter never crosses a tenant boundary.
 */
export class SqliteAttendanceRepository implements AttendanceRepository {
  constructor(private readonly db: DB) {}

  async save(record: AttendanceRecord): Promise<void> {
    this.db.prepare(SAVE_SQL).run(toParams(record));
  }

  /** Upsert a session's whole roll-call in one transaction (SOU-58). */
  async saveMany(records: readonly AttendanceRecord[]): Promise<void> {
    const saveAll = this.db.transaction((rows: readonly AttendanceRecord[]) => {
      const upsert = this.db.prepare(SAVE_SQL);
      for (const row of rows) {
        upsert.run(toParams(row));
      }
    });
    saveAll(records);
  }

  async findById(id: AttendanceRecordId): Promise<AttendanceRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM attendance_records WHERE id = ? AND deleted_at IS NULL')
      .get(id) as AttendanceRecordRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: AttendanceRecordId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare(
        'UPDATE attendance_records SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      )
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly AttendanceRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM attendance_records WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as AttendanceRecordRow[];
    return rows.map(fromRow);
  }

  async listBySession(sessionId: SessionId): Promise<readonly AttendanceRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM attendance_records
          WHERE session_id = ? AND deleted_at IS NULL
          ORDER BY student_id`,
      )
      .all(sessionId) as AttendanceRecordRow[];
    return rows.map(fromRow);
  }

  async summarizeForStudent(studentId: StudentId, range: DateRange): Promise<AttendanceSummary> {
    const rows = this.db
      .prepare(
        `SELECT ar.status AS status, COUNT(*) AS count
           FROM attendance_records ar
           JOIN sessions s ON s.id = ar.session_id
          WHERE ar.student_id = ?
            AND ar.deleted_at IS NULL
            AND s.deleted_at IS NULL
            AND s.date BETWEEN ? AND ?
          GROUP BY ar.status`,
      )
      .all(studentId, range.start, range.end) as { status: string; count: number }[];

    const summary = emptySummary();
    for (const row of rows) summary[row.status as AttendanceStatus] = row.count;
    return summary;
  }
}
