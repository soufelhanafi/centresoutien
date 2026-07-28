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
