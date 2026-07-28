/**
 * Time source. The domain never calls `new Date()` — it reads the injected
 * Clock so timestamps are deterministic in tests and honest in production
 * (always UTC). The concrete SystemClock lives outside the domain.
 */
export interface Clock {
  now(): Date;
}
