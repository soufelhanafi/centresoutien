import type { LockoutState } from '../value-objects/lockout-state';

/**
 * Persistence port for the security-questions throttle (SOU-155). Same shape
 * as `LoginThrottleStore` by design, but a distinct port/table: this counts
 * wrong answer attempts against the 3-attempt threshold, independent of the
 * 6-attempt login/recovery-code lockout. Singleton — one local reset path.
 */
export interface SecurityQuestionThrottleStore {
  get(): Promise<LockoutState>;
  save(state: LockoutState): Promise<void>;
  reset(): Promise<void>;
}
