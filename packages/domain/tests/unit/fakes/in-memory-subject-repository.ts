import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type {
  SubjectRepository,
  SubjectUsage,
  SubjectUsageReference,
} from '../../../src/ports/subject-repository';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link SubjectRepository} for unit tests. Reuses the shared
 * soft-deletable base (save / findById / softDelete / listChangedSince / all) and
 * adds the code-uniqueness lookup and the in-use read model. Reference counts are
 * arranged with {@link setUsageCount} (the fake owns no groups table), matching the
 * SQLite adapter's semantics: live subjects only, tombstoned references excluded,
 * `canDelete === (inUseCount === 0)`. The named breakdown defaults to `[]` and is
 * arranged with {@link setReferences} only by tests that need it — callers that
 * only care about the count keep `setUsageCount` alone. `setReferences` derives
 * the count from `refs.length`, so the read model can never report the impossible
 * state `references.length !== inUseCount`.
 */
export class InMemorySubjectRepository
  extends InMemorySoftDeletableRepository<SubjectId, Subject>
  implements SubjectRepository
{
  private readonly usage = new Map<SubjectId, number>();
  private readonly references = new Map<SubjectId, readonly SubjectUsageReference[]>();

  /** Arrange the active-reference count a `listWithUsage` row should report. */
  setUsageCount(id: SubjectId, count: number): void {
    this.usage.set(id, count);
  }

  /** Arrange the named-reference breakdown; the count follows from `refs.length` so both stay consistent. */
  setReferences(id: SubjectId, refs: readonly SubjectUsageReference[]): void {
    this.references.set(id, refs);
    this.usage.set(id, refs.length);
  }

  async findByCode(centerCode: CenterCode, code: string): Promise<Subject | null> {
    for (const row of this.rows.values()) {
      if (row.deletedAt === null && row.centerCode === centerCode && row.code === code) {
        return structuredClone(row);
      }
    }
    return null;
  }

  async listActive(centerCode: CenterCode): Promise<readonly Subject[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode && row.active)
      .map((row) => structuredClone(row));
  }

  async listAll(centerCode: CenterCode): Promise<readonly Subject[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode)
      .map((row) => structuredClone(row));
  }

  async listWithUsage(centerCode: CenterCode): Promise<readonly SubjectUsage[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode)
      // Match the adapter's `ORDER BY s.name_fr COLLATE NOCASE, s.id`: name first,
      // then id as a stable tiebreak for equal names.
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr) || a.id.localeCompare(b.id))
      .map((row) => {
        const refs = this.references.get(row.id);
        const inUseCount = refs ? refs.length : (this.usage.get(row.id) ?? 0);
        return {
          subject: structuredClone(row),
          inUseCount,
          canDelete: inUseCount === 0,
          references: refs ?? [],
        };
      });
  }
}
