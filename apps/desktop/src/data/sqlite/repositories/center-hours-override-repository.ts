import type { Database as DB } from 'better-sqlite3';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  CenterHoursOverrideRepository,
  CenterCode,
  ChangeLogWriter,
  DeviceId,
  UserId,
  WeeklyTimeWindows,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';

/** The `center_hours_overrides` table row shape as SQLite returns it. */
type CenterHoursOverrideRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  start_date: string;
  end_date: string;
  hours_by_weekday: string;
};

function fromRow(row: CenterHoursOverrideRow): CenterHoursOverride {
  return {
    id: row.id as CenterHoursOverrideId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    dateRange: { start: row.start_date, end: row.end_date },
    hoursByWeekday: JSON.parse(row.hours_by_weekday) as WeeklyTimeWindows,
  };
}

const SAVE_SQL = `
  INSERT INTO center_hours_overrides
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, start_date, end_date, hours_by_weekday)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @start_date, @end_date, @hours_by_weekday)
  ON CONFLICT(id) DO UPDATE SET
    updated_at       = excluded.updated_at,
    updated_by       = excluded.updated_by,
    deleted_at       = excluded.deleted_at,
    version          = excluded.version,
    start_date       = excluded.start_date,
    end_date         = excluded.end_date,
    hours_by_weekday = excluded.hours_by_weekday
`;

/**
 * SQLite adapter for {@link CenterHoursOverrideRepository} (SOU-165). Pure
 * translation between the port and SQL — no business decisions. Reads hide
 * tombstones; `listChangedSince` (the sync feed) includes them. Identity columns
 * (id, center_code, device_origin, created_at) are never rewritten on upsert.
 * `hours_by_weekday` round-trips as validated JSON text — the domain owns its
 * shape and ordering invariants, this layer only serializes it.
 *
 * Every write appends to the append-only `change_log` (SOU-199) inside the same
 * transaction, so an override created or archived on one device propagates to the
 * others through the ordinary sync feed instead of staying device-local.
 */
export class SqliteCenterHoursOverrideRepository implements CenterHoursOverrideRepository {
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async save(override: CenterHoursOverride): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(SAVE_SQL).run({
        id: override.id,
        center_code: override.centerCode,
        device_origin: override.deviceOrigin,
        created_at: override.createdAt.toISOString(),
        updated_at: override.updatedAt.toISOString(),
        updated_by: override.updatedBy,
        deleted_at: override.deletedAt ? override.deletedAt.toISOString() : null,
        version: override.version,
        start_date: override.dateRange.start,
        end_date: override.dateRange.end,
        hours_by_weekday: JSON.stringify(override.hoursByWeekday),
      });
      this.changeLog.record({
        entityType: 'center_hours_overrides',
        entityId: toEntityId(override.id),
        centerCode: override.centerCode,
        intent: 'upsert',
        entity: override,
      });
    })();
  }

  async findById(id: CenterHoursOverrideId): Promise<CenterHoursOverride | null> {
    const row = this.db
      .prepare('SELECT * FROM center_hours_overrides WHERE id = ? AND deleted_at IS NULL')
      .get(id) as CenterHoursOverrideRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: CenterHoursOverrideId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM center_hours_overrides WHERE id = ?')
        .get(id) as CenterHoursOverrideRow | undefined;
      if (!row) return;
      this.db
        .prepare(
          'UPDATE center_hours_overrides SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        )
        .run(iso, iso, by, id);
      this.changeLog.record({
        entityType: 'center_hours_overrides',
        entityId: toEntityId(id),
        centerCode: row.center_code as CenterCode,
        intent: 'delete',
        // The tombstoned domain entity — exactly the persisted state after the UPDATE.
        entity: { ...fromRow(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
  }

  async listChangedSince(cursor: Date): Promise<readonly CenterHoursOverride[]> {
    const rows = this.db
      .prepare('SELECT * FROM center_hours_overrides WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as CenterHoursOverrideRow[];
    return rows.map(fromRow);
  }

  async listForCenter(centerCode: CenterCode): Promise<readonly CenterHoursOverride[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM center_hours_overrides
         WHERE center_code = ? AND deleted_at IS NULL
         ORDER BY start_date, id`,
      )
      .all(centerCode) as CenterHoursOverrideRow[];
    return rows.map(fromRow);
  }

  async listOverlapping(
    centerCode: CenterCode,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<readonly CenterHoursOverride[]> {
    // Two inclusive ranges intersect iff each starts on or before the other ends.
    const rows = this.db
      .prepare(
        `SELECT * FROM center_hours_overrides
         WHERE center_code = ? AND deleted_at IS NULL
           AND start_date <= ? AND end_date >= ?
         ORDER BY start_date, id`,
      )
      .all(centerCode, rangeEnd, rangeStart) as CenterHoursOverrideRow[];
    return rows.map(fromRow);
  }
}
