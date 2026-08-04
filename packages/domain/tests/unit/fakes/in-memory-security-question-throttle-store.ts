import type { SecurityQuestionThrottleStore } from '../../../src/ports/security-question-throttle-store';
import { type LockoutState, UNLOCKED_STATE } from '../../../src/value-objects/lockout-state';

/**
 * In-memory {@link SecurityQuestionThrottleStore} for unit tests. Singleton
 * state, starting unlocked. Clones on read/write so callers cannot mutate
 * stored state.
 */
export class InMemorySecurityQuestionThrottleStore implements SecurityQuestionThrottleStore {
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
