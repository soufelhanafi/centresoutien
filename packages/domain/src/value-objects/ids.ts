import type { Brand } from './brand';

/**
 * Envelope identity value objects. Entity-specific ids (StudentId, TeacherId…)
 * are declared alongside their entities; these are the cross-cutting ones every
 * entity's envelope carries.
 */
export type CenterCode = Brand<string, 'CenterCode'>; // 'CS-CASA-001' — the tenant
export type DeviceId = Brand<string, 'DeviceId'>; // machine that first created a row
export type UserId = Brand<string, 'UserId'>; // last editor, shown in the conflict popup

/**
 * A generic entity ULID, for references that name an entity without owning its
 * concrete branded id (e.g. a scheduling ref to a Session whose entity is not
 * built yet). Entity-specific ids stay stronger — prefer `RoomId`, `StudentId`,
 * etc. where the entity exists.
 */
export type EntityId = Brand<string, 'EntityId'>;

/**
 * Widen any entity's concrete branded id (SubjectId, StudentId, …) to the
 * generic {@link EntityId}. The one audited spot where the specific brand is
 * erased — for storing an id in a type-agnostic place like the change_log key,
 * which is keyed by `(entityType, entityId)` and cannot know each entity's brand.
 */
export function toEntityId(id: string): EntityId {
  return id as EntityId;
}

/**
 * Canonical 26-char ULID in Crockford base32 (excludes I, L, O, U). Anchored,
 * uppercase-only — the exact form the `ulid` package emits.
 */
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: string): boolean {
  return ULID_REGEX.test(value);
}

/** True when `value` is `{prefix}_{ULID}` — e.g. hasIdPrefix('stu_01HW…', 'stu'). */
export function hasIdPrefix(value: string, prefix: string): boolean {
  const marker = `${prefix}_`;
  if (!value.startsWith(marker)) return false;
  return isUlid(value.slice(marker.length));
}

/**
 * The loose counterpart to {@link hasIdPrefix}, for ids that are a deterministic
 * composite key rather than a random ULID — `InvoiceId` / `InvoiceLineId` /
 * `TeacherPayoutId` (`deriveInvoiceId`, `deriveInvoiceLineId`,
 * `deriveTeacherPayoutId`), whose suffix is `centerCode`/`studentId`/`month` (or
 * similar) concatenated, not a ULID. Checks the prefix only.
 */
export function hasDeterministicIdPrefix(value: string, prefix: string): boolean {
  return value.startsWith(`${prefix}_`);
}
