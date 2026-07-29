import type { LockoutState } from '../value-objects/lockout-state';

/**
 * Persistence port for the login throttle (SOU-27). There is exactly one local
 * admin console, so the store is a singleton — no key. Device-local infra, like
 * {@link AdminAccountRepository}: no soft-delete, no sync surface.
 */
export interface LoginThrottleStore {
  /** Current throttle state; returns the unlocked default when none is recorded. */
  get(): Promise<LockoutState>;
  save(state: LockoutState): Promise<void>;
  /** Sugar for saving the unlocked state after a successful login. */
  reset(): Promise<void>;
}
