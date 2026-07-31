import type { Database as DB } from 'better-sqlite3';
import type {
  Subject,
  SubjectId,
  SubjectRepository,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `subjects` table row shape as SQLite returns it. */
type SubjectRow = {
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
  code: string | null;
  active: number;
};

function fromRow(row: SubjectRow): Subject {
  return {
    id: row.id as SubjectId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    name: { fr: row.name_fr, ar: row.name_ar },
    code: row.code,
    active: row.active === 1,
  };
}

const SAVE_SQL = `
  INSERT INTO subjects
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name_fr, name_ar, code, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name_fr, @name_ar, @code, @active)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    name_fr    = excluded.name_fr,
    name_ar    = excluded.name_ar,
    code       = excluded.code,
    active     = excluded.active
`;

/**
 * SQLite adapter for {@link SubjectRepository}. Pure translation between the
 * port and SQL — no business decisions. Reads hide tombstones; `listChangedSince`
 * (the sync feed) includes them. Identity columns are never rewritten on upsert.
 */
export class SqliteSubjectRepository implements SubjectRepository {
  constructor(private readonly db: DB) {}

  async save(subject: Subject): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: subject.id,
      center_code: subject.centerCode,
      device_origin: subject.deviceOrigin,
      created_at: subject.createdAt.toISOString(),
      updated_at: subject.updatedAt.toISOString(),
      updated_by: subject.updatedBy,
      deleted_at: subject.deletedAt ? subject.deletedAt.toISOString() : null,
      version: subject.version,
      name_fr: subject.name.fr,
      name_ar: subject.name.ar,
      code: subject.code,
      active: subject.active ? 1 : 0,
    });
  }

  async findById(id: SubjectId): Promise<Subject | null> {
    const row = this.db
      .prepare('SELECT * FROM subjects WHERE id = ? AND deleted_at IS NULL')
      .get(id) as SubjectRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findByCode(centerCode: CenterCode, code: string): Promise<Subject | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM subjects WHERE center_code = ? AND code = ? AND deleted_at IS NULL',
      )
      .get(centerCode, code) as SubjectRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: SubjectId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE subjects SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Subject[]> {
    const rows = this.db
      .prepare('SELECT * FROM subjects WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as SubjectRow[];
    return rows.map(fromRow);
  }
}
