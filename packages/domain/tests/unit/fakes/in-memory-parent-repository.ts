import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { ParentRepository } from '../../../src/ports/parent-repository';
import type { Parent, ParentId } from '../../../src/entities/parent';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link ParentRepository} for unit tests. Extends the shared
 * soft-deletable base and adds the `findByNaturalKey` and `listActive` reads —
 * which, like the SQLite adapter, match only live (non-tombstoned) rows and scope
 * to a center.
 */
export class InMemoryParentRepository
  extends InMemorySoftDeletableRepository<ParentId, Parent>
  implements ParentRepository
{
  async findByNaturalKey(naturalKey: string): Promise<Parent | null> {
    const hit = this.all().find((p) => p.naturalKey === naturalKey && p.deletedAt === null);
    return hit ?? null;
  }

  async listActive(centerCode: CenterCode): Promise<readonly Parent[]> {
    return this.all().filter(
      (parent) => parent.deletedAt === null && parent.centerCode === centerCode,
    );
  }
}
