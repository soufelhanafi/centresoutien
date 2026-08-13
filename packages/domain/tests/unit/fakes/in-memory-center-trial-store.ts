import type { CenterTrial } from '../../../src/plans/trial';
import type { CenterTrialStore } from '../../../src/ports/center-trial-store';

export class InMemoryCenterTrialStore implements CenterTrialStore {
  private trial: CenterTrial | null = null;

  get(): CenterTrial | null {
    return this.trial;
  }

  save(trial: CenterTrial): void {
    this.trial = trial;
  }

  start(at: Date): void {
    this.trial = { startedAt: at, lastSeenAt: at };
  }
}
