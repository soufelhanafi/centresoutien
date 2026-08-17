import type { Database as DB } from 'better-sqlite3';
import type {
  Niveau,
  NiveauId,
  NiveauRepository,
  NiveauUsage,
  NiveauUsageReference,
  CenterCode,
  DeviceId,
  EntityId,
  UserId,
  ChangeLogWriter,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';

/** The `niveaux` table row shape as SQLite returns it. */
type NiveauRow = {
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
  category: string;
  active: number;
};

function fromRow(row: NiveauRow): Niveau {
  return {
    id: row.id as NiveauId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    name: { fr: row.name_fr, ar: row.name_ar },
    code: row.code,
    category: row.category as Niveau['category'],
    active: row.active === 1,
  };
}

const SAVE_SQL = `
  INSERT INTO niveaux
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name_fr, name_ar, code, category, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name_fr, @name_ar, @code, @category, @active)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    name_fr    = excluded.name_fr,
    name_ar    = excluded.name_ar,
    code       = excluded.code,
    category   = excluded.category,
    active     = excluded.active
`;

// Live niveaux of the center, each with its active-reference count in one pass.
// `in_use_count` is a single scalar expression summing the three reference axes
// (SOU-260): live students whose `niveau_id` matches, live groups whose
// `niveau_id` matches, and live teachers whose `niveau_ids` JSON array contains
// it (via JSON1's json_each). All three are tenant-scoped and tombstone-excluded.
const LIST_WITH_USAGE_SQL = `
  SELECT n.*,
         (SELECT COUNT(*) FROM students s
           WHERE s.niveau_id = n.id
             AND s.center_code = n.center_code
             AND s.deleted_at IS NULL) +
         (SELECT COUNT(*) FROM groups g
           WHERE g.niveau_id = n.id
             AND g.center_code = n.center_code
             AND g.deleted_at IS NULL) +
         (SELECT COUNT(*) FROM teachers t
           WHERE t.center_code = n.center_code
             AND t.deleted_at IS NULL
             AND EXISTS (
               SELECT 1 FROM json_each(t.niveau_ids) WHERE json_each.value = n.id
             )) AS in_use_count
    FROM niveaux n
   WHERE n.center_code = ? AND n.deleted_at IS NULL
   ORDER BY n.category, n.name_fr COLLATE NOCASE, n.id
`;

// The named breakdown behind `in_use_count` above: every live student, group,
// and teacher of the center, so `listWithUsage` can group them by niveau id in
// JS and hand the manage screen something to name ("utilisé par l'élève Yassine
// Alaoui") instead of a bare number. A second/third query rather than a
// `json_group_array` in the first — same decision as the subject breakdown, so
// `references.length` always equals `in_use_count`.
const LIST_STUDENT_REFERENCES_SQL = `
  SELECT id, niveau_id, name_fr, name_ar
    FROM students
   WHERE center_code = ? AND deleted_at IS NULL AND niveau_id IS NOT NULL
   ORDER BY niveau_id, name_fr COLLATE NOCASE, id
`;
const LIST_GROUP_REFERENCES_SQL = `
  SELECT id, niveau_id, level
    FROM groups
   WHERE center_code = ? AND deleted_at IS NULL AND niveau_id IS NOT NULL
   ORDER BY niveau_id, level COLLATE NOCASE, id
`;
const LIST_TEACHER_REFERENCES_SQL = `
  SELECT id, niveau_ids, name_fr, name_ar
    FROM teachers
   WHERE center_code = ? AND deleted_at IS NULL
   ORDER BY id
`;

type StudentRefRow = { id: string; niveau_id: string; name_fr: string; name_ar: string };
type GroupRefRow = { id: string; niveau_id: string; level: string };
type TeacherRefRow = { id: string; niveau_ids: string; name_fr: string; name_ar: string };

/**
 * SQLite adapter for {@link NiveauRepository}. Pure translation between the
 * port and SQL — no business decisions. Reads hide tombstones; `listChangedSince`
 * (the sync feed) includes them. Identity columns are never rewritten on upsert.
 * Logs writes to the per-entity change log under the `niveaux` entity type.
 */
export class SqliteNiveauRepository implements NiveauRepository {
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async save(niveau: Niveau): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(SAVE_SQL).run({
        id: niveau.id,
        center_code: niveau.centerCode,
        device_origin: niveau.deviceOrigin,
        created_at: niveau.createdAt.toISOString(),
        updated_at: niveau.updatedAt.toISOString(),
        updated_by: niveau.updatedBy,
        deleted_at: niveau.deletedAt ? niveau.deletedAt.toISOString() : null,
        version: niveau.version,
        name_fr: niveau.name.fr,
        name_ar: niveau.name.ar,
        code: niveau.code,
        category: niveau.category,
        active: niveau.active ? 1 : 0,
      });
      this.changeLog.record({
        entityType: 'niveaux',
        entityId: toEntityId(niveau.id),
        centerCode: niveau.centerCode,
        intent: 'upsert',
        entity: niveau,
      });
    })();
  }

  async findById(id: NiveauId): Promise<Niveau | null> {
    const row = this.db
      .prepare('SELECT * FROM niveaux WHERE id = ? AND deleted_at IS NULL')
      .get(id) as NiveauRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findByCode(centerCode: CenterCode, code: string): Promise<Niveau | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM niveaux WHERE center_code = ? AND code = ? AND deleted_at IS NULL',
      )
      .get(centerCode, code) as NiveauRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: NiveauId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM niveaux WHERE id = ?')
        .get(id) as NiveauRow | undefined;
      if (!row) return;
      this.db
        .prepare('UPDATE niveaux SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
        .run(iso, iso, by, id);
      this.changeLog.record({
        entityType: 'niveaux',
        entityId: toEntityId(id),
        centerCode: row.center_code as CenterCode,
        intent: 'delete',
        // The tombstoned domain entity — exactly the persisted state after the UPDATE.
        entity: { ...fromRow(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
  }

  async listChangedSince(cursor: Date): Promise<readonly Niveau[]> {
    const rows = this.db
      .prepare('SELECT * FROM niveaux WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as NiveauRow[];
    return rows.map(fromRow);
  }

  async listActive(centerCode: CenterCode): Promise<readonly Niveau[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM niveaux
          WHERE center_code = ? AND deleted_at IS NULL AND active = 1
          ORDER BY category, name_fr COLLATE NOCASE, id`,
      )
      .all(centerCode) as NiveauRow[];
    return rows.map(fromRow);
  }

  async listAll(centerCode: CenterCode): Promise<readonly Niveau[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM niveaux
          WHERE center_code = ? AND deleted_at IS NULL
          ORDER BY category, name_fr COLLATE NOCASE, id`,
      )
      .all(centerCode) as NiveauRow[];
    return rows.map(fromRow);
  }

  async listWithUsage(centerCode: CenterCode): Promise<readonly NiveauUsage[]> {
    const rows = this.db
      .prepare(LIST_WITH_USAGE_SQL)
      .all(centerCode) as (NiveauRow & { in_use_count: number })[];
    const studentRows = this.db.prepare(LIST_STUDENT_REFERENCES_SQL).all(centerCode) as StudentRefRow[];
    const groupRows = this.db.prepare(LIST_GROUP_REFERENCES_SQL).all(centerCode) as GroupRefRow[];
    const teacherRows = this.db.prepare(LIST_TEACHER_REFERENCES_SQL).all(centerCode) as TeacherRefRow[];

    const referencesByNiveau = new Map<string, NiveauUsageReference[]>();
    const push = (niveauId: string, reference: NiveauUsageReference) => {
      const existing = referencesByNiveau.get(niveauId);
      if (existing) existing.push(reference);
      else referencesByNiveau.set(niveauId, [reference]);
    };
    for (const student of studentRows) {
      push(student.niveau_id, {
        kind: 'student',
        id: student.id as EntityId,
        label: { fr: student.name_fr, ar: student.name_ar },
      });
    }
    for (const group of groupRows) {
      // A Group has no name of its own — only `level` (a plain, untranslated
      // string, like `Room.name`) — so the bilingual label duplicates it.
      push(group.niveau_id, {
        kind: 'group',
        id: group.id as EntityId,
        label: { fr: group.level, ar: group.level },
      });
    }
    for (const teacher of teacherRows) {
      const niveauIds: unknown = JSON.parse(teacher.niveau_ids);
      if (!Array.isArray(niveauIds)) continue;
      for (const id of niveauIds) {
        if (typeof id === 'string') {
          push(id, {
            kind: 'teacher',
            id: teacher.id as EntityId,
            label: { fr: teacher.name_fr, ar: teacher.name_ar },
          });
        }
      }
    }

    return rows.map((row) => {
      const inUseCount = row.in_use_count;
      return {
        niveau: fromRow(row),
        inUseCount,
        canDelete: inUseCount === 0,
        references: referencesByNiveau.get(row.id) ?? [],
      };
    });
  }
}
