import { diffChangedFields } from '../sync/change-log';
import type { Clock } from '../ports/clock';
import type { UserId } from '../value-objects/ids';
import type { EntityEnvelope } from './envelope';

export type WriteContext = {
  clock: Clock;
  updatedBy: UserId;
};

export type WriteResult<T> = {
  next: T;
  changedFields: string[];
};

/**
 * Apply a domain-field patch to an entity, honoring invariant 5: a real change
 * bumps `updatedAt`/`updatedBy` and reports the changed field names; a no-op
 * patch returns the original entity untouched (no spurious sync delta). Never
 * touches `version` — that is the hub's to assign.
 */
export function applyWrite<T extends EntityEnvelope>(
  prev: T,
  patch: Partial<T>,
  ctx: WriteContext,
): WriteResult<T> {
  const candidate = { ...prev, ...patch };
  const changedFields = diffChangedFields(prev, candidate);
  if (changedFields.length === 0) {
    return { next: prev, changedFields: [] };
  }
  const next: T = { ...candidate, updatedAt: ctx.clock.now(), updatedBy: ctx.updatedBy };
  return { next, changedFields };
}
