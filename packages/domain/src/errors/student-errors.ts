import { DomainError } from './plan-errors';
import type { StudentId } from '../entities/student';

/**
 * Thrown when an edit or archive targets a student id that has no live row —
 * unknown, or already soft-deleted. The renderer resolves the stable
 * `student-not-found` code via `t(\`errors.${code}\`)`; the domain stays
 * i18n-agnostic.
 */
export class StudentNotFoundError extends DomainError {
  readonly code = 'student-not-found';

  constructor(readonly id: StudentId) {
    super(`No live student with id "${id}".`);
  }
}

/**
 * Thrown when a partial-update channel (e.g. `SetStudentGuardians`) carries an
 * `expectedVersion` that no longer matches the student's current `version` —
 * someone else (a sync pull, another edit) changed the row since the caller last
 * read it. This is the optimistic-concurrency guard on top of the standard
 * envelope `version` counter (see `sync-safe-entities`): the renderer must
 * refetch and retry rather than silently overwrite an unseen change.
 */
export class StudentVersionConflictError extends DomainError {
  readonly code = 'student-version-conflict';

  constructor(
    readonly id: StudentId,
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `Student "${id}" has version ${currentVersion}, but expected ${expectedVersion}.`,
    );
  }
}
