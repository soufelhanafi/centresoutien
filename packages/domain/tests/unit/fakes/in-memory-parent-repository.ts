import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { ParentRepository } from '../../../src/ports/parent-repository';
import type { Parent, ParentId } from '../../../src/entities/parent';

/**
 * In-memory {@link ParentRepository} for unit tests. Extends the shared
 * soft-deletable base and adds the `findByNaturalKey` lookup — which, like the
 * SQLite adapter, matches only live (non-tombstoned) rows.
 */
export class InMemoryParentRepository
  extends InMemorySoftDeletableRepository<ParentId, Parent>
  implements ParentRepository
{
  async findByNaturalKey(naturalKey: string): Promise<Parent | null> {
    const hit = this.all().find((p) => p.naturalKey === naturalKey && p.deletedAt === null);
    return hit ?? null;
  }
}
