import type { Database as DB } from 'better-sqlite3';
import type {
  Holiday,
  HolidayId,
  HolidayKind,
  HolidayRepository,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `holidays` table row shape as SQLite returns it. */
type HolidayRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  name_fr: string;
  name_ar: string;
  kind: string;
  start_date: string;
  end_date: string;
};

function fromRow(row: HolidayRow): Holiday {
  return {
    id: row.id as HolidayId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    name: { fr: row.name_fr, ar: row.name_ar },
    // The CHECK constraint guarantees only 'fixed' | 'lunar' reach here.
    kind: row.kind as HolidayKind,
    startDate: row.start_date,
    endDate: row.end_date,
    // Invariant, not a stored column — holidays never affect invoicing.
    affectsInvoicing: false,
  };
}

const SAVE_SQL = `
  INSERT INTO holidays
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name_fr, name_ar, kind, start_date, end_date)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name_fr, @name_ar, @kind, @start_date, @end_date)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    name_fr    = excluded.name_fr,
    name_ar    = excluded.name_ar,
    kind       = excluded.kind,
    start_date = excluded.start_date,
    end_date   = excluded.end_date
`;

/**
 * SQLite adapter for {@link HolidayRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the
 * sync feed) and `listArchived` / `findArchivedById` (the restore path) deliberately
 * see them. Identity columns (`id`, `center_code`, `device_origin`, `created_at`)
 * are never rewritten on upsert.
 */
export class SqliteHolidayRepository implements HolidayRepository {
  constructor(private readonly db: DB) {}

  async save(holiday: Holiday): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: holiday.id,
      center_code: holiday.centerCode,
      device_origin: holiday.deviceOrigin,
      created_at: holiday.createdAt.toISOString(),
      updated_at: holiday.updatedAt.toISOString(),
      updated_by: holiday.updatedBy,
      deleted_at: holiday.deletedAt ? holiday.deletedAt.toISOString() : null,
      version: holiday.version,
      name_fr: holiday.name.fr,
      name_ar: holiday.name.ar,
      kind: holiday.kind,
      start_date: holiday.startDate,
      end_date: holiday.endDate,
    });
  }

  async findById(id: HolidayId): Promise<Holiday | null> {
    const row = this.db
      .prepare('SELECT * FROM holidays WHERE id = ? AND deleted_at IS NULL')
      .get(id) as HolidayRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: HolidayId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE holidays SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Holiday[]> {
    const rows = this.db
      .prepare('SELECT * FROM holidays WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as HolidayRow[];
    return rows.map(fromRow);
  }

  async listActive(centerCode: CenterCode): Promise<readonly Holiday[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM holidays WHERE center_code = ? AND deleted_at IS NULL ORDER BY start_date, name_fr COLLATE NOCASE',
      )
      .all(centerCode) as HolidayRow[];
    return rows.map(fromRow);
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Holiday[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM holidays WHERE center_code = ? AND deleted_at IS NOT NULL ORDER BY start_date, name_fr COLLATE NOCASE',
      )
      .all(centerCode) as HolidayRow[];
    return rows.map(fromRow);
  }

  async findArchivedById(id: HolidayId): Promise<Holiday | null> {
    const row = this.db
      .prepare('SELECT * FROM holidays WHERE id = ? AND deleted_at IS NOT NULL')
      .get(id) as HolidayRow | undefined;
    return row ? fromRow(row) : null;
  }
}
