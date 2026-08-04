import { type LockoutState, UNLOCKED_STATE } from '../value-objects/lockout-state';

/**
 * Consecutive wrong answers that trip the lock (SOU-155's acceptance
 * criteria: "3rd wrong attempt triggers lockout"). Deliberately tighter than
 * `LoginThrottlePolicy`'s 6 — security questions are a weaker, low-trust gate
 * in a small center where staff/parents often know each other.
 */
export const MAX_FAILED_SECURITY_ANSWER_ATTEMPTS = 3;

/** How long the reset path stays locked once tripped: 15 minutes, same cooldown as SOU-27. */
export const SECURITY_QUESTION_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Pure decision logic for security-question throttling (SOU-155). Same shape
 * and same `LockoutState` as {@link LoginThrottlePolicy} by design — the
 * KICKOFF decision was to reuse that policy's shape/values — but a distinct
 * class and a distinct persisted counter, because this gate's 3-attempt
 * threshold is independent of the 6-attempt login/recovery-code lockout.
 */
export class SecurityQuestionThrottlePolicy {
  /** The instant the reset path unlocks as epoch millis, or `null` when not locked. */
  lockActiveUntil(state: LockoutState, now: Date): number | null {
    if (state.lockedUntil !== null && state.lockedUntil > now.getTime()) {
      return state.lockedUntil;
    }
    return null;
  }

  /** State after one wrong answer set. Mirrors `LoginThrottlePolicy.registerFailure`. */
  registerFailure(state: LockoutState, now: Date): LockoutState {
    const expired = state.lockedUntil !== null && now.getTime() >= state.lockedUntil;
    const failedAttempts = (expired ? 0 : state.failedAttempts) + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_SECURITY_ANSWER_ATTEMPTS
        ? now.getTime() + SECURITY_QUESTION_LOCKOUT_DURATION_MS
        : null;
    return { failedAttempts, lockedUntil };
  }

  /** Tries left before the lock trips. Zero once locked. */
  remainingAttempts(state: LockoutState): number {
    return Math.max(0, MAX_FAILED_SECURITY_ANSWER_ATTEMPTS - state.failedAttempts);
  }

  /** The clean state after all three answers verify correctly. */
  reset(): LockoutState {
    return UNLOCKED_STATE;
  }
}
