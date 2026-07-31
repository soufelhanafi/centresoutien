import { DomainError } from './plan-errors';
import type { ParentId } from '../entities/parent';
import type { TeacherId } from '../entities/teacher';

/**
 * Thrown when creating a parent/guardian that exactly matches an existing live
 * record in the same center (same normalized name + E.164 phone → same
 * `naturalKey`). This is the write-time hit of the parents-first duplicate
 * matching hierarchy: the use case detects it via `findByNaturalKey` and rejects
 * with a typed error the renderer can map to a localized `errors.*` message,
 * rather than letting the DB partial-unique index leak a raw persistence error.
 */
export class DuplicateParentError extends DomainError {
  constructor(readonly naturalKey: string) {
    super(`A parent with the same name and phone already exists (naturalKey "${naturalKey}").`);
  }
}

/**
 * Thrown when an edit or archive targets a parent id that has no live row —
 * unknown, or already soft-deleted (mirrors {@link StudentNotFoundError}). The
 * renderer resolves the stable `parent-not-found` code via `t(\`errors.${code}\`)`;
 * the domain stays i18n-agnostic.
 */
export class ParentNotFoundError extends DomainError {
  readonly code = 'parent-not-found';

  constructor(readonly id: ParentId) {
    super(`No live parent with id "${id}".`);
  }
}

/**
 * Thrown when creating a teacher that exactly matches an existing live record in
 * the same center (same normalized bilingual name + E.164 phone → same
 * `naturalKey`). The write-time hit of the phone-anchored duplicate hierarchy:
 * the use case detects it via `findByNaturalKey` and rejects with a typed error
 * the renderer maps to a localized `errors.*` message, rather than letting the DB
 * partial-unique index leak a raw persistence error. Mirrors {@link DuplicateParentError}.
 *
 * The human-readable message is deliberately PII-free: it crosses the IPC boundary
 * to the renderer (and may be logged there), so the `naturalKey` — a normalized
 * name + E.164 phone — is carried only as a typed field, never in the message text
 * (loi 09-08 / CNDP). The renderer maps the stable `duplicate-teacher` code via
 * `t(\`errors.${code}\`)`.
 */
export class DuplicateTeacherError extends DomainError {
  readonly code = 'duplicate-teacher';

  constructor(readonly naturalKey: string) {
    super('A teacher with the same name and phone already exists.');
  }
}

/**
 * Thrown when an edit or archive targets a teacher id that has no live row —
 * unknown, or already soft-deleted (mirrors {@link ParentNotFoundError}). The
 * renderer resolves the stable `teacher-not-found` code via `t(\`errors.${code}\`)`;
 * the domain stays i18n-agnostic.
 */
export class TeacherNotFoundError extends DomainError {
  readonly code = 'teacher-not-found';

  constructor(readonly id: TeacherId) {
    super(`No live teacher with id "${id}".`);
  }
}

/**
 * Thrown when archiving (soft-deleting) a teacher still referenced by at least one
 * active group, session, or payroll rule. `ArchiveTeacher` detects this via the
 * {@link import('../ports/teacher-reference').TeacherReferencePort} and rejects
 * with this typed error so the renderer can map it to a localized `errors.*`
 * message and steer the user to reassign the teacher's groups/rules first, rather
 * than silently orphaning a live schedule. Mirrors `RoomInUseError`. Until Groups
 * (SOU-48) and payroll (SOU-70) land, the reference stub reports "never
 * referenced", so this can only fire once those exist.
 */
export class TeacherInUseError extends DomainError {
  readonly code = 'teacher-in-use';

  constructor(readonly id: TeacherId) {
    super(`Teacher "${id}" cannot be archived while an active group, session, or payroll rule references it.`);
  }
}
