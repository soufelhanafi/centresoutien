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
