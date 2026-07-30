import type { Database as DB } from 'better-sqlite3';
import type {
  Student,
  StudentId,
  ParentId,
  StudentRepository,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `students` table row shape as SQLite returns it. */
type StudentRow = {
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
  birth_date: string;
  level: string;
  school: string | null;
  notes: string | null;
  guardian_ids: string;
};

/** Parse the stored JSON guardian array back into branded ParentIds. */
function parseGuardianIds(json: string): ParentId[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is string => typeof value === 'string') as ParentId[];
}

function fromRow(row: StudentRow): Student {
  return {
    id: row.id as StudentId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    naturalKey: row.natural_key,
    name: { fr: row.name_fr, ar: row.name_ar },
    birthDate: row.birth_date,
    level: row.level,
    school: row.school,
    notes: row.notes,
    guardianIds: parseGuardianIds(row.guardian_ids),
  };
}

const SAVE_SQL = `
  INSERT INTO students
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, natural_key, name_fr, name_ar, birth_date, level,
     school, notes, guardian_ids)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @natural_key, @name_fr, @name_ar, @birth_date, @level,
     @school, @notes, @guardian_ids)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    name_fr     = excluded.name_fr,
    name_ar     = excluded.name_ar,
    birth_date  = excluded.birth_date,
    level       = excluded.level,
    school      = excluded.school,
    notes       = excluded.notes,
    guardian_ids = excluded.guardian_ids
`;

/**
 * SQLite adapter for {@link StudentRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the
 * sync feed) includes them. Identity columns and the immutable `natural_key` are
 * never rewritten on upsert.
 */
export class SqliteStudentRepository implements StudentRepository {
  constructor(private readonly db: DB) {}

  async save(student: Student): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: student.id,
      center_code: student.centerCode,
      device_origin: student.deviceOrigin,
      created_at: student.createdAt.toISOString(),
      updated_at: student.updatedAt.toISOString(),
      updated_by: student.updatedBy,
      deleted_at: student.deletedAt ? student.deletedAt.toISOString() : null,
      version: student.version,
      natural_key: student.naturalKey,
      name_fr: student.name.fr,
      name_ar: student.name.ar,
      birth_date: student.birthDate,
      level: student.level,
      school: student.school,
      notes: student.notes,
      guardian_ids: JSON.stringify(student.guardianIds),
    });
  }

  async findById(id: StudentId): Promise<Student | null> {
    const row = this.db
      .prepare('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL')
      .get(id) as StudentRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: StudentId, at: Date): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(iso, iso, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Student[]> {
    const rows = this.db
      .prepare('SELECT * FROM students WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as StudentRow[];
    return rows.map(fromRow);
  }

  async findByNaturalKey(centerCode: CenterCode, naturalKey: string): Promise<readonly Student[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM students WHERE center_code = ? AND natural_key = ? AND deleted_at IS NULL ORDER BY created_at',
      )
      .all(centerCode, naturalKey) as StudentRow[];
    return rows.map(fromRow);
  }

  async countActive(centerCode: CenterCode): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM students WHERE center_code = ? AND deleted_at IS NULL')
      .get(centerCode) as { n: number };
    return row.n;
  }
}
