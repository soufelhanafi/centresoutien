import { DomainError } from './plan-errors';
import type { EntityId } from '../value-objects/ids';

/**
 * Thrown when a merge is asked to fold a record into itself (winnerId ===
 * loserId). A self-merge has no second record to retire — it is always a caller
 * bug (duplicate-conflict machinery feeding the same id on both sides), so the
 * merge use cases reject it before any guard or write runs.
 */
export class MergeSameEntityError extends DomainError {
  readonly code = 'merge-same-entity';

  constructor(readonly id: EntityId) {
    super(`Cannot merge record "${id}" into itself.`);
  }
}
