import { type LockoutState, UNLOCKED_STATE } from '../value-objects/lockout-state';

/** Consecutive failures that trip the lock. The 5th wrong try locks the console. */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long the console stays locked once tripped: 15 minutes. */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Pure decision logic for login throttling (SOU-27). Holds no state and does no
 * I/O — it maps a persisted {@link LockoutState} plus the current time to the
 * next state and to the "am I locked right now?" answer. The use case reads the
 * state from the store, calls this policy, and writes the result back.
 *
 * Timestamps here are honest UTC instants from the `Clock` port; nothing about
 * this is sync-related (auth is device-local), so there is no `version` game —
 * the wall clock is the only input, which is fine for a single local console.
 */
export class LoginThrottlePolicy {
  /**
   * The instant the console unlocks as epoch millis, or `null` when it is not
   * currently locked. A lock whose window has already elapsed reads as unlocked.
   */
  lockActiveUntil(state: LockoutState, now: Date): number | null {
    if (state.lockedUntil !== null && state.lockedUntil > now.getTime()) {
      return state.lockedUntil;
    }
    return null;
  }

  /**
   * State after one failed attempt. A failure that lands after an expired lock
   * starts a fresh count (the cooldown gives the user a clean slate). Reaching
   * {@link MAX_FAILED_ATTEMPTS} sets a new lock window from `now`.
   */
  registerFailure(state: LockoutState, now: Date): LockoutState {
    const expired = state.lockedUntil !== null && now.getTime() >= state.lockedUntil;
    const failedAttempts = (expired ? 0 : state.failedAttempts) + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS ? now.getTime() + LOCKOUT_DURATION_MS : null;
    return { failedAttempts, lockedUntil };
  }

  /** Tries left before the lock trips. Zero once the console is locked. */
  remainingAttempts(state: LockoutState): number {
    return Math.max(0, MAX_FAILED_ATTEMPTS - state.failedAttempts);
  }

  /** The clean state after a successful login. */
  reset(): LockoutState {
    return UNLOCKED_STATE;
  }
}
