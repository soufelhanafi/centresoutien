/**
 * The persisted state of the login throttle for the local admin console (SOU-27).
 * A small value object shared by the {@link LoginThrottlePolicy} (which computes
 * transitions) and the {@link LoginThrottleStore} port (which persists it).
 *
 * `failedAttempts` counts consecutive failures since the last success or expiry.
 * `lockedUntil` is the UTC instant the console unlocks as **epoch milliseconds**,
 * or `null` when not locked. It is a computed instant (now + cooldown), not a
 * clock reading, so it is a number the pure policy derives with plain arithmetic
 * — the domain never constructs `Date`s. Both are device-local (auth never
 * syncs), so this carries no sync envelope.
 */
export type LockoutState = {
  readonly failedAttempts: number;
  readonly lockedUntil: number | null;
};

/** The state of a console that has never recorded a failed attempt. */
export const UNLOCKED_STATE: LockoutState = { failedAttempts: 0, lockedUntil: null };
