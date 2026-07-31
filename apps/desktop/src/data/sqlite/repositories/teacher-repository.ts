import type { Database as DB } from 'better-sqlite3';
import type {
  Teacher,
  TeacherId,
  SubjectId,
  TeacherRepository,
  PhoneNumber,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `teachers` table row shape as SQLite returns it. */
type TeacherRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  natural_key: string;
  name_fr: string;
  name_ar: string;
  cin: string | null;
  phone: string;
  email: string | null;
  subject_ids: string;
  active: number;
};

/** Parse the stored JSON subject array back into branded SubjectIds. */
function parseSubjectIds(json: string): SubjectId[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is string => typeof value === 'string') as SubjectId[];
}

function fromRow(row: TeacherRow): Teacher {
  return {
    id: row.id as TeacherId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    naturalKey: row.natural_key,
    name: { fr: row.name_fr, ar: row.name_ar },
    cin: row.cin,
    phone: row.phone as PhoneNumber,
    email: row.email,
    subjectIds: parseSubjectIds(row.subject_ids),
    active: row.active === 1,
  };
}

const SAVE_SQL = `
  INSERT INTO teachers
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, natural_key, name_fr, name_ar, cin, phone, email,
     subject_ids, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @natural_key, @name_fr, @name_ar, @cin, @phone, @email,
     @subject_ids, @active)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    name_fr     = excluded.name_fr,
    name_ar     = excluded.name_ar,
    cin         = excluded.cin,
    phone       = excluded.phone,
    email       = excluded.email,
    subject_ids = excluded.subject_ids,
    active      = excluded.active
`;

/**
 * SQLite adapter for {@link TeacherRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the
 * sync feed) and `listArchived` / `findArchivedById` (the restore path)
 * deliberately see them. Identity columns and the immutable `natural_key` are
 * never rewritten on upsert.
 */
export class SqliteTeacherRepository implements TeacherRepository {
  constructor(private readonly db: DB) {}

  async save(teacher: Teacher): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: teacher.id,
      center_code: teacher.centerCode,
      device_origin: teacher.deviceOrigin,
      created_at: teacher.createdAt.toISOString(),
      updated_at: teacher.updatedAt.toISOString(),
      updated_by: teacher.updatedBy,
      deleted_at: teacher.deletedAt ? teacher.deletedAt.toISOString() : null,
      version: teacher.version,
      natural_key: teacher.naturalKey,
      name_fr: teacher.name.fr,
      name_ar: teacher.name.ar,
      cin: teacher.cin,
      phone: teacher.phone,
      email: teacher.email,
      subject_ids: JSON.stringify(teacher.subjectIds),
      active: teacher.active ? 1 : 0,
    });
  }

  async findById(id: TeacherId): Promise<Teacher | null> {
    const row = this.db
      .prepare('SELECT * FROM teachers WHERE id = ? AND deleted_at IS NULL')
      .get(id) as TeacherRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findByNaturalKey(naturalKey: string): Promise<Teacher | null> {
    const row = this.db
      .prepare('SELECT * FROM teachers WHERE natural_key = ? AND deleted_at IS NULL')
      .get(naturalKey) as TeacherRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: TeacherId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE teachers SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Teacher[]> {
    const rows = this.db
      .prepare('SELECT * FROM teachers WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as TeacherRow[];
    return rows.map(fromRow);
  }

  async countActive(centerCode: CenterCode): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM teachers WHERE center_code = ? AND deleted_at IS NULL')
      .get(centerCode) as { n: number };
    return row.n;
  }

  async listActive(centerCode: CenterCode): Promise<readonly Teacher[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM teachers WHERE center_code = ? AND deleted_at IS NULL ORDER BY name_fr COLLATE NOCASE, created_at',
      )
      .all(centerCode) as TeacherRow[];
    return rows.map(fromRow);
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Teacher[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM teachers WHERE center_code = ? AND deleted_at IS NOT NULL ORDER BY name_fr COLLATE NOCASE, created_at',
      )
      .all(centerCode) as TeacherRow[];
    return rows.map(fromRow);
  }

  async findArchivedById(id: TeacherId): Promise<Teacher | null> {
    const row = this.db
      .prepare('SELECT * FROM teachers WHERE id = ? AND deleted_at IS NOT NULL')
      .get(id) as TeacherRow | undefined;
    return row ? fromRow(row) : null;
  }
}
