/**
 * Randomness source. The domain never calls `Math.random()` — it reads the
 * injected RandomPort so the session generator's randomized weekday selection is
 * deterministic under a seeded fake in tests and honest in production. Same
 * pattern as {@link Clock}: the concrete seedable generator lives outside the
 * domain and is wired in the composition root.
 */
export interface RandomPort {
  /**
   * A uniform integer in `[0, boundExclusive)`. `boundExclusive` must be a
   * positive integer; callers pass a collection length, so a zero bound is a
   * caller bug, not an input to handle here.
   */
  nextInt(boundExclusive: number): number;
}
