import type { Database as DB } from 'better-sqlite3';
import type {
  Group,
  GroupId,
  GroupKind,
  GroupRepository,
  CenterCode,
  DeviceId,
  EntityId,
  SubjectId,
  RoomId,
  UserId,
} from '@centresoutien/domain';

/** The `groups` table row shape as SQLite returns it (`active` is a 0/1 integer). */
type GroupRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  subject_id: string;
  teacher_id: string | null;
  room_id: string;
  level: string;
  capacity: number;
  kind: string;
  active: number;
};

function fromRow(row: GroupRow): Group {
  return {
    id: row.id as GroupId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    subjectId: row.subject_id as SubjectId,
    teacherId: row.teacher_id === null ? null : (row.teacher_id as EntityId),
    roomId: row.room_id as RoomId,
    level: row.level,
    capacity: row.capacity,
    kind: row.kind as GroupKind,
    active: row.active !== 0,
  };
}

const SAVE_SQL = `
  INSERT INTO groups
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, subject_id, teacher_id, room_id, level, capacity, kind, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @subject_id, @teacher_id, @room_id, @level, @capacity, @kind, @active)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    subject_id = excluded.subject_id,
    teacher_id = excluded.teacher_id,
    room_id    = excluded.room_id,
    level      = excluded.level,
    capacity   = excluded.capacity,
    kind       = excluded.kind,
    active     = excluded.active
`;

/**
 * SQLite adapter for {@link GroupRepository}. Pure translation between the port and
 * SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the sync
 * feed) and `listArchived` / `findArchivedById` (the restore path) deliberately
 * see them. Identity columns (`id`, `center_code`, `device_origin`, `created_at`)
 * are never rewritten on upsert. Mirrors {@link SqliteRoomRepository}.
 */
export class SqliteGroupRepository implements GroupRepository {
  constructor(private readonly db: DB) {}

  async save(group: Group): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: group.id,
      center_code: group.centerCode,
      device_origin: group.deviceOrigin,
      created_at: group.createdAt.toISOString(),
      updated_at: group.updatedAt.toISOString(),
      updated_by: group.updatedBy,
      deleted_at: group.deletedAt ? group.deletedAt.toISOString() : null,
      version: group.version,
      subject_id: group.subjectId,
      teacher_id: group.teacherId,
      room_id: group.roomId,
      level: group.level,
      capacity: group.capacity,
      kind: group.kind,
      active: group.active ? 1 : 0,
    });
  }

  async findById(id: GroupId): Promise<Group | null> {
    const row = this.db
      .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
      .get(id) as GroupRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: GroupId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE groups SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Group[]> {
    const rows = this.db
      .prepare('SELECT * FROM groups WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as GroupRow[];
    return rows.map(fromRow);
  }

  async listActive(centerCode: CenterCode): Promise<readonly Group[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM groups WHERE center_code = ? AND deleted_at IS NULL ORDER BY level COLLATE NOCASE, id',
      )
      .all(centerCode) as GroupRow[];
    return rows.map(fromRow);
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Group[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM groups WHERE center_code = ? AND deleted_at IS NOT NULL ORDER BY level COLLATE NOCASE, id',
      )
      .all(centerCode) as GroupRow[];
    return rows.map(fromRow);
  }

  async findArchivedById(id: GroupId): Promise<Group | null> {
    const row = this.db
      .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NOT NULL')
      .get(id) as GroupRow | undefined;
    return row ? fromRow(row) : null;
  }
}
