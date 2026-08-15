import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  ChangeLogWriter,
  DeviceId,
  TeacherAvailability,
  TeacherAvailabilityId,
  TeacherAvailabilityRepository,
  TeacherId,
  UserId,
  WeeklyTimeWindows,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';

/** The `teacher_availability` table row shape as SQLite returns it. */
type TeacherAvailabilityRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  teacher_id: string;
  weekly_windows: string;
};

function fromRow(row: TeacherAvailabilityRow): TeacherAvailability {
  return {
    id: row.id as TeacherAvailabilityId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    teacherId: row.teacher_id as TeacherId,
    weeklyWindows: JSON.parse(row.weekly_windows) as WeeklyTimeWindows,
  };
}

const SAVE_SQL = `
  INSERT INTO teacher_availability
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, teacher_id, weekly_windows)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @teacher_id, @weekly_windows)
  ON CONFLICT(id) DO UPDATE SET
    updated_at     = excluded.updated_at,
    updated_by     = excluded.updated_by,
    deleted_at     = excluded.deleted_at,
    version        = excluded.version,
    weekly_windows = excluded.weekly_windows
`;

/**
 * SQLite adapter for {@link TeacherAvailabilityRepository} (SOU-259). Pure
 * translation between the port and SQL — no business decisions. Reads hide
 * tombstones; `listChangedSince` (the sync feed) includes them. Identity
 * columns (id, center_code, device_origin, created_at, teacher_id) are never
 * rewritten on upsert. `weekly_windows` round-trips as validated JSON text —
 * the domain owns its shape and ordering invariants.
 *
 * Every write appends to the append-only `change_log` inside the same
 * transaction, so a teacher's windows edited on one device propagate to the
 * others through the ordinary sync feed.
 */
export class SqliteTeacherAvailabilityRepository implements TeacherAvailabilityRepository {
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async save(availability: TeacherAvailability): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(SAVE_SQL).run({
        id: availability.id,
        center_code: availability.centerCode,
        device_origin: availability.deviceOrigin,
        created_at: availability.createdAt.toISOString(),
        updated_at: availability.updatedAt.toISOString(),
        updated_by: availability.updatedBy,
        deleted_at: availability.deletedAt ? availability.deletedAt.toISOString() : null,
        version: availability.version,
        teacher_id: availability.teacherId,
        weekly_windows: JSON.stringify(availability.weeklyWindows),
      });
      this.changeLog.record({
        entityType: 'teacher_availability',
        entityId: toEntityId(availability.id),
        centerCode: availability.centerCode,
        intent: 'upsert',
        entity: availability,
      });
    })();
  }

  async findById(id: TeacherAvailabilityId): Promise<TeacherAvailability | null> {
    const row = this.db
      .prepare('SELECT * FROM teacher_availability WHERE id = ? AND deleted_at IS NULL')
      .get(id) as TeacherAvailabilityRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: TeacherAvailabilityId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM teacher_availability WHERE id = ?')
        .get(id) as TeacherAvailabilityRow | undefined;
      if (!row) return;
      this.db
        .prepare(
          'UPDATE teacher_availability SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        )
        .run(iso, iso, by, id);
      this.changeLog.record({
        entityType: 'teacher_availability',
        entityId: toEntityId(id),
        centerCode: row.center_code as CenterCode,
        intent: 'delete',
        entity: { ...fromRow(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
  }

  async listChangedSince(cursor: Date): Promise<readonly TeacherAvailability[]> {
    const rows = this.db
      .prepare('SELECT * FROM teacher_availability WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as TeacherAvailabilityRow[];
    return rows.map(fromRow);
  }

  async findByTeacher(centerCode: CenterCode, teacherId: TeacherId): Promise<TeacherAvailability | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM teacher_availability WHERE center_code = ? AND teacher_id = ? AND deleted_at IS NULL',
      )
      .get(centerCode, teacherId) as TeacherAvailabilityRow | undefined;
    return row ? fromRow(row) : null;
  }

  async listForCenter(centerCode: CenterCode): Promise<readonly TeacherAvailability[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM teacher_availability WHERE center_code = ? AND deleted_at IS NULL ORDER BY id',
      )
      .all(centerCode) as TeacherAvailabilityRow[];
    return rows.map(fromRow);
  }
}
