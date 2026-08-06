import type { IdGenerator } from '../../../src/ports/id-generator';

/**
 * Deterministic id generator for tests. Emits `{prefix}_{26 digits}` — digits
 * are valid Crockford base32, so the ids also satisfy `isUlid`.
 */
export function fakeIds(seed = 1): IdGenerator {
  let n = seed;
  return {
    next: <T extends string = string>(prefix: string) =>
      `${prefix}_${String(n++).padStart(26, '0')}` as T,
  };
}
