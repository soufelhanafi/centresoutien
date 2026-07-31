import { DomainError } from './plan-errors';
import type { SubjectId } from '../entities/subject';

/**
 * Thrown when archiving (soft-deleting) a Subject that is still referenced by at
 * least one active Group, Session, or Formula. `ArchiveSubject` detects this via
 * the `SubjectReferencePort` and rejects with this typed error so the renderer can
 * map the stable `subject-in-use` code to a localized `errors.*` message and steer
 * the user to reassign or deactivate first, rather than orphaning live records.
 * Mirrors `RoomInUseError`.
 */
export class SubjectInUseError extends DomainError {
  readonly code = 'subject-in-use';

  constructor(readonly subjectId: SubjectId) {
    super(`Subject "${subjectId}" cannot be archived while a group, session, or formula references it.`);
  }
}

/**
 * Thrown when an archive targets a subject id that has no live row in the current
 * center — unknown, already soft-deleted, or belonging to another center. The
 * renderer resolves the stable `subject-not-found` code via `t(\`errors.${code}\`)`;
 * the domain stays i18n-agnostic. Mirrors `RoomNotFoundError` so the archive use
 * cases behave consistently and neither silently no-ops.
 */
export class SubjectNotFoundError extends DomainError {
  readonly code = 'subject-not-found';

  constructor(readonly subjectId: SubjectId) {
    super(`No live subject with id "${subjectId}".`);
  }
}

/**
 * Thrown when creating a Subject whose `code` already belongs to another live
 * subject in the same center. `CreateSubject` checks this via
 * `SubjectRepository.findByCode` before persisting. Uniqueness is per center and
 * only among live rows, so a code freed by archiving can be reused. The renderer
 * resolves the stable `duplicate-subject-code` code to a localized message.
 */
export class DuplicateSubjectCodeError extends DomainError {
  readonly code = 'duplicate-subject-code';

  constructor(readonly subjectCode: string) {
    super(`A subject with code "${subjectCode}" already exists in this center.`);
  }
}
