import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { FormulaRepository } from '../../../src/ports/formula-repository';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link FormulaRepository} for unit tests. Reuses the shared
 * soft-deletable base (save / findById / softDelete / listChangedSince) and adds
 * the center-scoped active-picker list, matching the SQLite adapter's semantics:
 * live rows only, `active` flag true.
 */
export class InMemoryFormulaRepository
  extends InMemorySoftDeletableRepository<FormulaId, Formula>
  implements FormulaRepository
{
  async listActive(centerCode: CenterCode): Promise<readonly Formula[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode && row.active)
      .map((row) => structuredClone(row));
  }
}
