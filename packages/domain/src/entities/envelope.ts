import type { Clock } from '../ports/clock';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';

/**
 * The common envelope every entity carries (CLAUDE.md §5). Identity fields are
 * `readonly` so accidental mutation is a type error. `version` is assigned by
 * the sync hub — 0 until the row's first successful push.
 */
export type EntityEnvelope = {
  readonly centerCode: CenterCode; // the tenant; never crosses centers
  readonly deviceOrigin: DeviceId; // machine that first created the row
  readonly createdAt: Date; // UTC, from the Clock port
  updatedAt: Date; // UTC, from the Clock port
  updatedBy: UserId; // who last edited — "who" in the conflict popup
  deletedAt: Date | null; // soft delete only
  version: number; // hub-assigned optimistic-concurrency counter
};

/** Envelope bookkeeping field names — excluded from the per-field change log. */
export const ENVELOPE_FIELD_NAMES = [
  'centerCode',
  'deviceOrigin',
  'createdAt',
  'updatedAt',
  'updatedBy',
  'deletedAt',
  'version',
] as const;

export type NewEnvelopeInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/** Build a fresh envelope: createdAt == updatedAt from the clock, version 0, alive. */
export function newEnvelope(input: NewEnvelopeInput, clock: Clock): EntityEnvelope {
  const now = clock.now();
  return {
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    createdAt: now,
    updatedAt: now,
    updatedBy: input.updatedBy,
    deletedAt: null,
    version: 0,
  };
}

/**
 * Apply a hub-assigned version. The counter is strictly monotonic — a version
 * that does not advance signals a protocol bug and is rejected (never silently
 * accepted, which could reorder writes).
 */
export function acceptHubVersion<T extends { version: number }>(entity: T, version: number): T {
  if (version <= entity.version) {
    throw new Error(
      `version must be monotonic: received ${version}, current is ${entity.version}`,
    );
  }
  return { ...entity, version };
}
