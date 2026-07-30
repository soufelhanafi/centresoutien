import { DomainError } from './plan-errors';

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
