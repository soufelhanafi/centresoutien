import type { Database as DB } from 'better-sqlite3';
import type { NiveauReferencePort, NiveauId } from '@centresoutien/domain';

/**
 * SQLite adapter for {@link NiveauReferencePort}: true when any live student,
 * group, or teacher references the niveau (SOU-260). A composite over the three
 * tables that can reference a niveau — `students.niveau_id`, `groups.niveau_id`,
 * and `teachers.niveau_ids` (JSON membership via JSON1's json_each). Tombstones
 * excluded on all three axes, mirroring the `listWithUsage` counts so the guard
 * and the manage screen can never disagree.
 *
 * No `center_code` filter is needed (mirroring `SqliteGroupRepository.isSubjectInUse`):
 * the port is keyed by `niveauId` alone and a niveau ULID is globally unique, so
 * it identifies exactly one center's niveau; only that center's rows can
 * legitimately reference it, and `ArchiveNiveau` pre-verifies the tenant anyway.
 */
export class SqliteNiveauReference implements NiveauReferencePort {
  constructor(private readonly db: DB) {}

  async isNiveauInUse(niveauId: NiveauId): Promise<boolean> {
    const student = this.db
      .prepare('SELECT 1 FROM students WHERE niveau_id = ? AND deleted_at IS NULL LIMIT 1')
      .get(niveauId);
    if (student !== undefined) return true;

    const group = this.db
      .prepare('SELECT 1 FROM groups WHERE niveau_id = ? AND deleted_at IS NULL LIMIT 1')
      .get(niveauId);
    if (group !== undefined) return true;

    const teacher = this.db
      .prepare(
        `SELECT 1 FROM teachers
          WHERE deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM json_each(teachers.niveau_ids) WHERE json_each.value = ?)
          LIMIT 1`,
      )
      .get(niveauId);
    return teacher !== undefined;
  }
}
