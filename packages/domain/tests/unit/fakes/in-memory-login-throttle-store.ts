import type { LoginThrottleStore } from '../../../src/ports/login-throttle-store';
import { type LockoutState, UNLOCKED_STATE } from '../../../src/value-objects/lockout-state';

/**
 * In-memory {@link LoginThrottleStore} for unit tests. Singleton state, starting
 * unlocked. Clones on read/write so callers cannot mutate stored state.
 */
export class InMemoryLoginThrottleStore implements LoginThrottleStore {
  private state: LockoutState = UNLOCKED_STATE;

  async get(): Promise<LockoutState> {
    return { ...this.state };
  }

  async save(state: LockoutState): Promise<void> {
    this.state = { ...state };
  }

  async reset(): Promise<void> {
    this.state = UNLOCKED_STATE;
  }
}
