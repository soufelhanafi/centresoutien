import { ENVELOPE_FIELD_NAMES } from '../entities/envelope';
import { valuesEqual } from './change-log';
import type { HubChange, LocalChange } from '../ports/sync-hub-port';
import type { EntityId } from '../value-objects/ids';
import type { SyncConflict } from './conflicts';
import { isImmutableEntityType } from './immutable-entities';

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
  | { readonly kind: 'conflict'; readonly conflict: SyncConflict }
  /**
   * A real edit on an immutable entity — its locked decision (pricing, amount)
   * cannot fork across devices. Never a popup: the engine blocks the pending
   * write and aborts the sync so the hub's canonical state wins instead.
   */
  | {
      readonly kind: 'immutable-divergence';
      readonly entityType: string;
      readonly entityId: EntityId;
    };

export function resolveInboundChange(input: {
  entityType: string;
  entityId: EntityId;
  local: LocalChange | null;
  inbound: HubChange;
}): ResolveOutcome {
  const { local, inbound } = input;
  if (local === null) {
    // Copy, never alias: the stored snapshot must not share the hub feed object.
    return { kind: 'apply', entity: { ...inbound.entity }, version: inbound.version };
  }

  const mineDeleted = local.op === 'delete';
  const theirsDeleted = inbound.op === 'delete';

  if (mineDeleted && theirsDeleted) {
    // Both tombstoned — the hub's tombstone is canonical. No conflict: two
    // devices deleting the same record is agreement, not a misunderstanding.
    return { kind: 'apply', entity: { ...inbound.entity }, version: inbound.version };
  }

  // Envelope bookkeeping is engine-managed; only domain fields can merge or clash.
  const mineFields = domainFields(local.changedFields);
  const theirsFields = domainFields(inbound.changedFields);

  // Immutable entities carry locked decisions (formula price, invoice/payout
  // amounts) that must never fork across devices. A real edit on either side is
  // divergence — no merge, no popup (a popup choice on immutable data would
  // itself let one device override a locked value). This also preempts
  // delete-vs-edit on an immutable entity: the edit side is divergence.
  if (isImmutableEntityType(input.entityType) && (mineFields.length > 0 || theirsFields.length > 0)) {
    return { kind: 'immutable-divergence', entityType: input.entityType, entityId: input.entityId };
  }

  if (mineDeleted !== theirsDeleted) {
    // One deleted, the other edited — a real-world misunderstanding, never
    // auto-resolved in either direction (dedicated popup tab).
    return { kind: 'conflict', conflict: deleteVsEdit({ ...input, local }) };
  }

  const clashFields = mineFields.filter(
    (field) => theirsFields.includes(field) && !valuesEqual(local.entity[field], inbound.entity[field]),
  );

  if (clashFields.length > 0) {
    return { kind: 'conflict', conflict: fieldClash({ ...input, local }, clashFields) };
  }

  const merged = { ...local.entity };
  for (const field of theirsFields) {
    if (PROTOTYPE_KEYS.has(field)) continue; // never let the wire touch the object's prototype
    merged[field] = inbound.entity[field];
  }
  return {
    kind: 'merged',
    entity: merged,
    // The union is the exact set of fields this merged write changes vs the
    // common base (each side's change log is relative to that base). Downstream
    // clash detection re-checks by value, so including a field only one side
    // changed to a different value still surfaces a real clash — never a
    // fabricated one. Envelope fields never appear (the write path excludes
    // them); they are engine-managed.
    changedFields: Array.from(new Set([...mineFields, ...theirsFields])),
    baseVersion: inbound.version,
  };
}

/** Envelope bookkeeping is engine-managed — it can neither merge nor clash. */
function domainFields(fields: readonly string[]): readonly string[] {
  const envelope = ENVELOPE_FIELD_NAMES as readonly string[];
  return fields.filter((field) => !envelope.includes(field));
}

/** Wire field names that would alter the object's prototype on assignment. */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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
  input: { entityType: string; entityId: EntityId; local: LocalChange; inbound: HubChange },
  fields: readonly string[],
): SyncConflict {
  return {
    kind: 'field-clash',
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.inbound.version,
    fields,
    mine: side(input, 'mine'),
    theirs: side(input, 'theirs'),
  };
}

function deleteVsEdit(input: {
  entityType: string;
  entityId: EntityId;
  local: LocalChange;
  inbound: HubChange;
}): SyncConflict {
  return {
    kind: 'delete-vs-edit',
    entityType: input.entityType,
    entityId: input.entityId,
    mine: side(input, 'mine'),
    theirs: side(input, 'theirs'),
  };
}
