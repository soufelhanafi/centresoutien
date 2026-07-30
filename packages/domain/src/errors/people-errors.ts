import { DomainError } from './plan-errors';
import type { ParentId } from '../entities/parent';

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
