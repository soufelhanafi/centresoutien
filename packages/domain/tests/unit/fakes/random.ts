import type { RandomPort } from '../../../src/ports/random-port';

/**
 * Deterministic {@link RandomPort} for tests. `fakeRandom()` is the identity
 * source: `nextInt(bound)` returns `bound - 1`, so a Fisher-Yates pass only ever
 * swaps each element with itself and leaves the input order untouched — the
 * generator's first feasible combination is then the one in pool order (fully
 * predictable assertions). `seededRandom(seed)` gives a small reproducible LCG
 * for tests that need genuine, but still deterministic, variation across runs.
 */
export function fakeRandom(): RandomPort {
  return { nextInt: (boundExclusive: number) => boundExclusive - 1 };
}

export function seededRandom(seed: number): RandomPort {
  let state = seed >>> 0;
  return {
    nextInt(boundExclusive: number): number {
      // Numerical Recipes LCG — deterministic, adequate for shuffling in tests.
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % boundExclusive;
    },
  };
}
