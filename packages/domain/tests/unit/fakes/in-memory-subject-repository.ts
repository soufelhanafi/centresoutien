import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { SubjectRepository } from '../../../src/ports/subject-repository';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link SubjectRepository} for unit tests. Reuses the shared
 * soft-deletable base (save / findById / softDelete / listChangedSince / all) and
 * adds the code-uniqueness lookup: the live subject of a center with a given code,
 * matching the partial-unique-index semantics the SQLite adapter upholds.
 */
export class InMemorySubjectRepository
  extends InMemorySoftDeletableRepository<SubjectId, Subject>
  implements SubjectRepository
{
  async findByCode(centerCode: CenterCode, code: string): Promise<Subject | null> {
    for (const row of this.rows.values()) {
      if (row.deletedAt === null && row.centerCode === centerCode && row.code === code) {
        return structuredClone(row);
      }
    }
    return null;
  }
}
