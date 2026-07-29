import type { Database as DB } from 'better-sqlite3';
import type {
  CenterHours,
  CenterHoursId,
  CenterHoursRepository,
  CenterCode,
  DeviceId,
  UserId,
  TimeOfDay,
  WeekdayIndex,
} from '@centresoutien/domain';

/** The `center_hours` table row shape as SQLite returns it. */
type CenterHoursRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  day_of_week: number;
  open: string | null;
  close: string | null;
};

function fromRow(row: CenterHoursRow): CenterHours {
  return {
    id: row.id as CenterHoursId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    dayOfWeek: row.day_of_week as WeekdayIndex,
    open: row.open === null ? null : (row.open as TimeOfDay),
    close: row.close === null ? null : (row.close as TimeOfDay),
  };
}

const SAVE_SQL = `
  INSERT INTO center_hours
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, day_of_week, open, close)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @day_of_week, @open, @close)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    open       = excluded.open,
    close      = excluded.close
`;

/**
 * SQLite adapter for {@link CenterHoursRepository}. Pure translation between the
 * port and SQL — no business decisions. Reads hide tombstones; `listChangedSince`
 * (the sync feed) includes them. Identity columns (id, center_code, device_origin,
 * created_at, day_of_week) are never rewritten on upsert.
 */
export class SqliteCenterHoursRepository implements CenterHoursRepository {
  constructor(private readonly db: DB) {}

  async save(hours: CenterHours): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: hours.id,
      center_code: hours.centerCode,
      device_origin: hours.deviceOrigin,
      created_at: hours.createdAt.toISOString(),
      updated_at: hours.updatedAt.toISOString(),
      updated_by: hours.updatedBy,
      deleted_at: hours.deletedAt ? hours.deletedAt.toISOString() : null,
      version: hours.version,
      day_of_week: hours.dayOfWeek,
      open: hours.open,
      close: hours.close,
    });
  }

  async findById(id: CenterHoursId): Promise<CenterHours | null> {
    const row = this.db
      .prepare('SELECT * FROM center_hours WHERE id = ? AND deleted_at IS NULL')
      .get(id) as CenterHoursRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: CenterHoursId, at: Date): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE center_hours SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(iso, iso, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly CenterHours[]> {
    const rows = this.db
      .prepare('SELECT * FROM center_hours WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as CenterHoursRow[];
    return rows.map(fromRow);
  }

  async listForCenter(centerCode: CenterCode): Promise<readonly CenterHours[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM center_hours WHERE center_code = ? AND deleted_at IS NULL ORDER BY day_of_week',
      )
      .all(centerCode) as CenterHoursRow[];
    return rows.map(fromRow);
  }

  async findByDay(centerCode: CenterCode, dayOfWeek: WeekdayIndex): Promise<CenterHours | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM center_hours WHERE center_code = ? AND day_of_week = ? AND deleted_at IS NULL',
      )
      .get(centerCode, dayOfWeek) as CenterHoursRow | undefined;
    return row ? fromRow(row) : null;
  }
}
