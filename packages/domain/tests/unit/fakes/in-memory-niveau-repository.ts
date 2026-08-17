import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type {
  NiveauRepository,
  NiveauUsage,
  NiveauUsageReference,
} from '../../../src/ports/niveau-repository';
import type { Niveau, NiveauId } from '../../../src/entities/niveau';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link NiveauRepository} for unit tests. Reuses the shared
 * soft-deletable base (save / findById / softDelete / listChangedSince / all) and
 * adds the code-uniqueness lookup and the in-use read model. Reference counts are
 * arranged with {@link setUsageCount} (the fake owns no student/group/teacher
 * tables), matching the SQLite adapter's semantics: live niveaux only,
 * tombstoned references excluded, `canDelete === (inUseCount === 0)`. The named
 * breakdown defaults to `[]` and is arranged with {@link setReferences} only by
 * tests that need it; `setReferences` derives the count from `refs.length`, so
 * the read model can never report the impossible state
 * `references.length !== inUseCount`. Mirrors `InMemorySubjectRepository`.
 */
export class InMemoryNiveauRepository
  extends InMemorySoftDeletableRepository<NiveauId, Niveau>
  implements NiveauRepository
{
  private readonly usage = new Map<NiveauId, number>();
  private readonly references = new Map<NiveauId, readonly NiveauUsageReference[]>();

  /** Arrange the active-reference count a `listWithUsage` row should report. */
  setUsageCount(id: NiveauId, count: number): void {
    this.usage.set(id, count);
  }

  /** Arrange the named-reference breakdown; the count follows from `refs.length` so both stay consistent. */
  setReferences(id: NiveauId, refs: readonly NiveauUsageReference[]): void {
    this.references.set(id, refs);
    this.usage.set(id, refs.length);
  }

  async findByCode(centerCode: CenterCode, code: string): Promise<Niveau | null> {
    for (const row of this.rows.values()) {
      if (row.deletedAt === null && row.centerCode === centerCode && row.code === code) {
        return structuredClone(row);
      }
    }
    return null;
  }

  async listActive(centerCode: CenterCode): Promise<readonly Niveau[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode && row.active)
      .map((row) => structuredClone(row));
  }

  async listAll(centerCode: CenterCode): Promise<readonly Niveau[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode)
      .map((row) => structuredClone(row));
  }

  async listWithUsage(centerCode: CenterCode): Promise<readonly NiveauUsage[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode)
      // Match the adapter's ordering: category rank, then name, then id.
      .sort(
        (a, b) =>
          categoryRank(a) - categoryRank(b) ||
          a.name.fr.localeCompare(b.name.fr) ||
          a.id.localeCompare(b.id),
      )
      .map((row) => {
        const refs = this.references.get(row.id);
        const inUseCount = refs ? refs.length : (this.usage.get(row.id) ?? 0);
        return {
          niveau: structuredClone(row),
          inUseCount,
          canDelete: inUseCount === 0,
          references: refs ?? [],
        };
      });
  }
}

const categoryRank = (niveau: Niveau): number =>
  niveau.category === 'primaire' ? 0 : niveau.category === 'college' ? 1 : 2;
