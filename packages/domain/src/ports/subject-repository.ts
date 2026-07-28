import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Subject, SubjectId } from '../entities/subject';

/**
 * Persistence port for Subjects. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete.
 */
export type SubjectRepository = SoftDeletableRepository<SubjectId, Subject>;
