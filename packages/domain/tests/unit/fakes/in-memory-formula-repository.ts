import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { FormulaRepository } from '../../../src/ports/formula-repository';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link FormulaRepository} for unit tests. Reuses the shared
 * soft-deletable base (save / findById / softDelete / listChangedSince / all) and
 * adds the two center-scoped list queries, matching the SQLite adapter's
 * semantics: live rows only, name-ordered. `save()` here does NOT flip
 * `isImmutable` on its own — tests that need an immutable row seed one directly
 * via `save({ ..., isImmutable: true })`, since the fake has no invoice-line
 * trigger to mirror.
 */
export class InMemoryFormulaRepository
  extends InMemorySoftDeletableRepository<FormulaId, Formula>
  implements FormulaRepository
{
  async listActive(centerCode: CenterCode): Promise<readonly Formula[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode && row.active)
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr) || a.id.localeCompare(b.id))
      .map((row) => structuredClone(row));
  }

  async listAll(centerCode: CenterCode): Promise<readonly Formula[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode)
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr) || a.id.localeCompare(b.id))
      .map((row) => structuredClone(row));
  }
}
