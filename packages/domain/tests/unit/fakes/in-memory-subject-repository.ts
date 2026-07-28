import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { SubjectRepository } from '../../../src/ports/subject-repository';
import type { Subject, SubjectId } from '../../../src/entities/subject';

/**
 * In-memory {@link SubjectRepository} for unit tests. The Subject port adds
 * nothing beyond the soft-deletable surface, so the shared base is the whole
 * implementation (`all()` included for assertions).
 */
export class InMemorySubjectRepository
  extends InMemorySoftDeletableRepository<SubjectId, Subject>
  implements SubjectRepository {}
