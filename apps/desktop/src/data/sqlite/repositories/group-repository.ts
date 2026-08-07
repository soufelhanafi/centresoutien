import type { Database as DB } from 'better-sqlite3';
import type {
  Group,
  GroupId,
  GroupKind,
  GroupRepository,
  SubjectReferencePort,
  CenterCode,
  DeviceId,
  EntityId,
  SubjectId,
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
    level: row.level,
    capacity: row.capacity,
    kind: row.kind as GroupKind,
    active: row.active !== 0,
  };
}

const SAVE_SQL = `
  INSERT INTO groups
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, subject_id, teacher_id, level, capacity, kind, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @subject_id, @teacher_id, @level, @capacity, @kind, @active)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    subject_id = excluded.subject_id,
    teacher_id = excluded.teacher_id,
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
 * are never rewritten on upsert. Mirrors {@link SqliteRoomRepository}. Also
 * satisfies {@link SubjectReferencePort}: `groups` is the only table that carries
 * `subject_id` today, so this repository owns the in-use query the `ArchiveSubject`
 * guard needs, and the composition root passes this same instance as the
 * subject-reference adapter (mirroring the session repo → `RoomReferencePort` wiring).
 */
export class SqliteGroupRepository implements GroupRepository, SubjectReferencePort {
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

  /**
   * {@link SubjectReferencePort}: true when any live group still references the
   * subject. Uses `ix_groups_subject(subject_id, deleted_at)`.
   *
   * No `center_code` filter is needed here (unlike `listWithUsage`, which
   * correlates on center): the port is keyed by `subjectId` alone and a subject
   * ULID is globally unique, so it identifies exactly one center's subject; only
   * that center's groups can legitimately reference it. Each center is also its own
   * SQLCipher file, and `ArchiveSubject` pre-verifies the subject's tenant before
   * ever calling this guard — so a live group matching `subject_id` is necessarily
   * same-tenant. Keep the port shape `isSubjectInUse(subjectId)`; do not add a
   * center param.
   *
   * Extension point — when sessions/formulas gain a `subject_id`, OR their
   * live-reference existence checks in here (or move this to a composite adapter);
   * the port stays boolean.
   */
  async isSubjectInUse(subjectId: SubjectId): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM groups WHERE subject_id = ? AND deleted_at IS NULL LIMIT 1')
      .get(subjectId) as { 1: number } | undefined;
    return row !== undefined;
  }
}
