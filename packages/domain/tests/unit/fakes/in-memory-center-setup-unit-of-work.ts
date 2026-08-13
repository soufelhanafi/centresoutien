import type {
  CenterSetupUnit,
  CenterSetupUnitOfWork,
} from '../../../src/ports/center-setup-unit-of-work';
import type { InMemoryCenterRepository } from './in-memory-center-repository';
import type { InMemoryCenterHoursRepository } from './in-memory-center-hours-repository';
import type { InMemoryCenterTrialStore } from './in-memory-center-trial-store';

export class InMemoryCenterSetupUnitOfWork implements CenterSetupUnitOfWork {
  commits = 0;

  constructor(
    private readonly centers: InMemoryCenterRepository,
    private readonly hours: InMemoryCenterHoursRepository,
    private readonly trials: InMemoryCenterTrialStore,
    private readonly fail?: () => void,
  ) {}

  async commit(unit: CenterSetupUnit): Promise<void> {
    this.commits += 1;
    this.fail?.();
    await this.centers.save(unit.center);
    for (const hours of unit.defaultHours) await this.hours.save(hours);
    if (unit.trial !== null) this.trials.save(unit.trial);
  }
}
