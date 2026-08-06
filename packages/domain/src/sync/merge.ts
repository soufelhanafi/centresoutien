import { valuesEqual } from './change-log';
import type { HubChange, LocalChange } from '../ports/sync-hub-port';
import type { EntityId } from '../value-objects/ids';
import type { SyncConflict } from './conflicts';

/**
 * The resolve step of pull → resolve → push (SOU-80 §3), one inbound hub change
 * at a time. Pure and clock-free — the engine decides timestamps, this decides
 * values.
 *
 * Three-way merge keyed on the per-entity change log: each side records which
 * domain fields it changed from the common base, so:
 * - fields only the hub changed → take the hub's value;
 * - fields only the device changed → keep the device's value;
 * - fields BOTH changed to the same value → clean;
 * - fields BOTH changed to different values → field-clash, to a human.
 *
 * This is the majority-of-sync path: disjoint field changes auto-merge silently,
 * and the conflict popup only ever fires on genuine same-field clashes.
 */

export type ResolveOutcome =
  /** Fast-forward: the device had no edit on this entity, take the hub state. */
  | { readonly kind: 'apply'; readonly entity: Record<string, unknown>; readonly version: number }
  /** Auto-merge: build a new pending write based on the hub's canonical version. */
  | {
      readonly kind: 'merged';
      readonly entity: Record<string, unknown>;
      readonly changedFields: readonly string[];
      readonly baseVersion: number;
    }
  /** Same-field clash or delete-vs-edit — nothing applied, nothing pushed. */
  | { readonly kind: 'conflict'; readonly conflict: SyncConflict };

export function resolveInboundChange(input: {
  entityType: string;
  entityId: string;
  local: LocalChange | null;
  inbound: HubChange;
}): ResolveOutcome {
  const { local, inbound } = input;
  if (local === null) {
    return { kind: 'apply', entity: inbound.entity as Record<string, unknown>, version: inbound.version };
  }

  const mineDeleted = local.op === 'delete';
  const theirsDeleted = inbound.op === 'delete';

  if (mineDeleted && theirsDeleted) {
    // Both tombstoned — the hub's tombstone is canonical. No conflict: two
    // devices deleting the same record is agreement, not a misunderstanding.
    return { kind: 'apply', entity: inbound.entity as Record<string, unknown>, version: inbound.version };
  }

  if (mineDeleted !== theirsDeleted) {
    // One deleted, the other edited — a real-world misunderstanding, never
    // auto-resolved in either direction (dedicated popup tab).
    return { kind: 'conflict', conflict: deleteVsEdit({ ...input, local }) };
  }

  const overlap = local.changedFields.filter((field) => inbound.changedFields.includes(field));
  const clashFields = overlap.filter(
    (field) => !valuesEqual(local.entity[field], inbound.entity[field]),
  );

  if (clashFields.length > 0) {
    return { kind: 'conflict', conflict: fieldClash({ ...input, local }, clashFields) };
  }

  const merged = { ...local.entity } as Record<string, unknown>;
  for (const field of inbound.changedFields) {
    if (field === 'version') continue; // envelope — the engine re-stamps it
    merged[field] = inbound.entity[field];
  }
  return {
    kind: 'merged',
    entity: merged,
    changedFields: Array.from(new Set([...local.changedFields, ...inbound.changedFields])),
    baseVersion: inbound.version,
  };
}

function side(input: { local: LocalChange; inbound: HubChange }, which: 'mine' | 'theirs') {
  const mine = input.local;
  const theirs = input.inbound;
  if (which === 'mine') {
    return {
      updatedBy: mine.updatedBy,
      deviceId: mine.deviceId,
      op: mine.op,
      seq: mine.seq,
      at: mine.at,
      changedFields: mine.changedFields,
      entity: mine.entity,
    };
  }
  return {
    updatedBy: theirs.updatedBy,
    deviceId: theirs.deviceId,
    op: theirs.op,
    seq: theirs.deviceSeq,
    at: theirs.receivedAt,
    changedFields: theirs.changedFields,
    entity: theirs.entity,
  };
}

function fieldClash(
  input: { entityType: string; entityId: string; local: LocalChange; inbound: HubChange },
  fields: readonly string[],
): SyncConflict {
  return {
    kind: 'field-clash',
    entityType: input.entityType,
    entityId: input.entityId as EntityId,
    version: input.inbound.version,
    fields,
    mine: side(input, 'mine'),
    theirs: side(input, 'theirs'),
  };
}

function deleteVsEdit(input: {
  entityType: string;
  entityId: string;
  local: LocalChange;
  inbound: HubChange;
}): SyncConflict {
  return {
    kind: 'delete-vs-edit',
    entityType: input.entityType,
    entityId: input.entityId as EntityId,
    mine: side(input, 'mine'),
    theirs: side(input, 'theirs'),
  };
}
