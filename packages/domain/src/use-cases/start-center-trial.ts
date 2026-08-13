import type { Clock } from '../ports/clock';
import type { CenterTrialStore } from '../ports/center-trial-store';
import type { CenterTrial } from '../plans/trial';

/** Starts the one-time local trial when a new center profile is first created. */
export class StartCenterTrial {
  constructor(
    private readonly trials: CenterTrialStore,
    private readonly clock: Clock,
  ) {}

  execute(): CenterTrial {
    const existing = this.trials.get();
    if (existing !== null) return existing;

    const now = this.clock.now();
    const trial = { startedAt: now, lastSeenAt: now };
    this.trials.save(trial);
    return trial;
  }
}
