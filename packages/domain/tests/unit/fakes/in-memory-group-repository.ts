import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { GroupRepository } from '../../../src/ports/group-repository';
import type { Group, GroupId } from '../../../src/entities/group';

/**
 * In-memory {@link GroupRepository} for unit tests. The Group port adds nothing
 * beyond the soft-deletable surface, so the shared base is the whole
 * implementation (`all()` included for assertions).
 */
export class InMemoryGroupRepository
  extends InMemorySoftDeletableRepository<GroupId, Group>
  implements GroupRepository {}
