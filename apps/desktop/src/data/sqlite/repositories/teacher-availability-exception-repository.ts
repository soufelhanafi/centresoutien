import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  ChangeLogWriter,
  DeviceId,
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
  TeacherAvailabilityExceptionRepository,
  TeacherId,
  UserId,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';

/** The `teacher_availability_exceptions` table row shape as SQLite returns it. */
type TeacherAvailabilityExceptionRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  teacher_id: string;
  start_date: string;
  end_date: string;
  label: string | null;
};

function fromRow(row: TeacherAvailabilityExceptionRow): TeacherAvailabilityException {
  return {
    id: row.id as TeacherAvailabilityExceptionId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    teacherId: row.teacher_id as TeacherId,
    dateRange: { start: row.start_date, end: row.end_date },
    label: row.label,
  };
}

const SAVE_SQL = `
  INSERT INTO teacher_availability_exceptions
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, teacher_id, start_date, end_date, label)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @teacher_id, @start_date, @end_date, @label)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    start_date = excluded.start_date,
    end_date   = excluded.end_date,
    label      = excluded.label
`;

/**
 * SQLite adapter for {@link TeacherAvailabilityExceptionRepository} (SOU-259).
 * Pure translation between the port and SQL — no business decisions. Reads hide
 * tombstones; `listChangedSince` (the sync feed) includes them. Identity
 * columns (id, center_code, device_origin, created_at, teacher_id) are never
 * rewritten on upsert.
 *
 * Every write appends to the append-only `change_log` inside the same
 * transaction, so an absence entered on one device propagates to the others
 * through the ordinary sync feed.
 */
export class SqliteTeacherAvailabilityExceptionRepository
  implements TeacherAvailabilityExceptionRepository
{
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async save(exception: TeacherAvailabilityException): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(SAVE_SQL).run({
        id: exception.id,
        center_code: exception.centerCode,
        device_origin: exception.deviceOrigin,
        created_at: exception.createdAt.toISOString(),
        updated_at: exception.updatedAt.toISOString(),
        updated_by: exception.updatedBy,
        deleted_at: exception.deletedAt ? exception.deletedAt.toISOString() : null,
        version: exception.version,
        teacher_id: exception.teacherId,
        start_date: exception.dateRange.start,
        end_date: exception.dateRange.end,
        label: exception.label,
      });
      this.changeLog.record({
        entityType: 'teacher_availability_exceptions',
        entityId: toEntityId(exception.id),
        centerCode: exception.centerCode,
        intent: 'upsert',
        entity: exception,
      });
    })();
  }

  async findById(id: TeacherAvailabilityExceptionId): Promise<TeacherAvailabilityException | null> {
    const row = this.db
      .prepare('SELECT * FROM teacher_availability_exceptions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as TeacherAvailabilityExceptionRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: TeacherAvailabilityExceptionId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM teacher_availability_exceptions WHERE id = ?')
        .get(id) as TeacherAvailabilityExceptionRow | undefined;
      if (!row) return;
      this.db
        .prepare(
          'UPDATE teacher_availability_exceptions SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        )
        .run(iso, iso, by, id);
      this.changeLog.record({
        entityType: 'teacher_availability_exceptions',
        entityId: toEntityId(id),
        centerCode: row.center_code as CenterCode,
        intent: 'delete',
        entity: { ...fromRow(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
  }

  async listChangedSince(cursor: Date): Promise<readonly TeacherAvailabilityException[]> {
    const rows = this.db
      .prepare('SELECT * FROM teacher_availability_exceptions WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as TeacherAvailabilityExceptionRow[];
    return rows.map(fromRow);
  }

  async listForTeacher(
    centerCode: CenterCode,
    teacherId: TeacherId,
  ): Promise<readonly TeacherAvailabilityException[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM teacher_availability_exceptions
         WHERE center_code = ? AND teacher_id = ? AND deleted_at IS NULL
         ORDER BY start_date, id`,
      )
      .all(centerCode, teacherId) as TeacherAvailabilityExceptionRow[];
    return rows.map(fromRow);
  }

  async listOverlapping(
    centerCode: CenterCode,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<readonly TeacherAvailabilityException[]> {
    // Two inclusive ranges intersect iff each starts on or before the other ends.
    const rows = this.db
      .prepare(
        `SELECT * FROM teacher_availability_exceptions
         WHERE center_code = ? AND deleted_at IS NULL
           AND start_date <= ? AND end_date >= ?
         ORDER BY start_date, id`,
      )
      .all(centerCode, rangeEnd, rangeStart) as TeacherAvailabilityExceptionRow[];
    return rows.map(fromRow);
  }
}
