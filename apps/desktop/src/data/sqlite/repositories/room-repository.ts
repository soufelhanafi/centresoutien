import type { Database as DB } from 'better-sqlite3';
import type {
  Room,
  RoomId,
  RoomRepository,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `rooms` table row shape as SQLite returns it (`active` is a 0/1 integer). */
type RoomRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  name: string;
  capacity: number;
  active: number;
};

function fromRow(row: RoomRow): Room {
  return {
    id: row.id as RoomId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    name: row.name,
    capacity: row.capacity,
    active: row.active !== 0,
  };
}

const SAVE_SQL = `
  INSERT INTO rooms
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name, capacity, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name, @capacity, @active)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    name       = excluded.name,
    capacity   = excluded.capacity,
    active     = excluded.active
`;

/**
 * SQLite adapter for {@link RoomRepository}. Pure translation between the port and
 * SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the sync
 * feed) and `listArchived` / `findArchivedById` (the restore path) deliberately
 * see them. Identity columns (`id`, `center_code`, `device_origin`, `created_at`)
 * are never rewritten on upsert.
 */
export class SqliteRoomRepository implements RoomRepository {
  constructor(private readonly db: DB) {}

  async save(room: Room): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: room.id,
      center_code: room.centerCode,
      device_origin: room.deviceOrigin,
      created_at: room.createdAt.toISOString(),
      updated_at: room.updatedAt.toISOString(),
      updated_by: room.updatedBy,
      deleted_at: room.deletedAt ? room.deletedAt.toISOString() : null,
      version: room.version,
      name: room.name,
      capacity: room.capacity,
      active: room.active ? 1 : 0,
    });
  }

  async findById(id: RoomId): Promise<Room | null> {
    const row = this.db
      .prepare('SELECT * FROM rooms WHERE id = ? AND deleted_at IS NULL')
      .get(id) as RoomRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: RoomId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE rooms SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Room[]> {
    const rows = this.db
      .prepare('SELECT * FROM rooms WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as RoomRow[];
    return rows.map(fromRow);
  }

  async listActive(centerCode: CenterCode): Promise<readonly Room[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM rooms WHERE center_code = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE, created_at',
      )
      .all(centerCode) as RoomRow[];
    return rows.map(fromRow);
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Room[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM rooms WHERE center_code = ? AND deleted_at IS NOT NULL ORDER BY name COLLATE NOCASE, created_at',
      )
      .all(centerCode) as RoomRow[];
    return rows.map(fromRow);
  }

  async countActive(centerCode: CenterCode): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM rooms WHERE center_code = ? AND deleted_at IS NULL')
      .get(centerCode) as { n: number };
    return row.n;
  }

  async findArchivedById(id: RoomId): Promise<Room | null> {
    const row = this.db
      .prepare('SELECT * FROM rooms WHERE id = ? AND deleted_at IS NOT NULL')
      .get(id) as RoomRow | undefined;
    return row ? fromRow(row) : null;
  }
}
