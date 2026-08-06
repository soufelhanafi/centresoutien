import { ENVELOPE_FIELD_NAMES } from '../entities/envelope';

/** Fields that never count as a domain change: identity + envelope bookkeeping. */
const EXCLUDED_FIELDS = new Set<string>(['id', ...ENVELOPE_FIELD_NAMES]);

/**
 * The names of the domain fields whose value differs between `prev` and `next`.
 * This is the per-entity change log (invariant 5): sync auto-merges
 * non-overlapping field changes and only routes same-field clashes to a human.
 * Envelope bookkeeping (updatedAt, version, …) and `id` are never reported.
 */
export function diffChangedFields<T extends object>(prev: T, next: T): string[] {
  const keys = new Set<string>([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    const before = (prev as Record<string, unknown>)[key];
    const after = (next as Record<string, unknown>)[key];
    if (!valuesEqual(before, after)) changed.push(key);
  }
  return changed;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, i) => valuesEqual(value, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => valuesEqual(a[key], b[key]));
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
