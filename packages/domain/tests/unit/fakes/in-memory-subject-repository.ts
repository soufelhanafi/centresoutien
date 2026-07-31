import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { SubjectRepository, SubjectUsage } from '../../../src/ports/subject-repository';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link SubjectRepository} for unit tests. Reuses the shared
 * soft-deletable base (save / findById / softDelete / listChangedSince / all) and
 * adds the code-uniqueness lookup and the in-use read model. Reference counts are
 * arranged with {@link setUsageCount} (the fake owns no groups table), matching the
 * SQLite adapter's semantics: live subjects only, tombstoned references excluded,
 * `canDelete === (inUseCount === 0)`.
 */
export class InMemorySubjectRepository
  extends InMemorySoftDeletableRepository<SubjectId, Subject>
  implements SubjectRepository
{
  private readonly usage = new Map<SubjectId, number>();

  /** Arrange the active-reference count a `listWithUsage` row should report. */
  setUsageCount(id: SubjectId, count: number): void {
    this.usage.set(id, count);
  }

  async findByCode(centerCode: CenterCode, code: string): Promise<Subject | null> {
    for (const row of this.rows.values()) {
      if (row.deletedAt === null && row.centerCode === centerCode && row.code === code) {
        return structuredClone(row);
      }
    }
    return null;
  }

  async listWithUsage(centerCode: CenterCode): Promise<readonly SubjectUsage[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode)
      // Match the adapter's `ORDER BY s.name_fr COLLATE NOCASE, s.id`: name first,
      // then id as a stable tiebreak for equal names.
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr) || a.id.localeCompare(b.id))
      .map((row) => {
        const inUseCount = this.usage.get(row.id) ?? 0;
        return { subject: structuredClone(row), inUseCount, canDelete: inUseCount === 0 };
      });
  }
}
