import type { Center } from '../entities/center';
import type { CenterHours } from '../entities/center-hours';
import type { CenterTrial } from '../plans/trial';

/** All durable records that must appear together for a newly configured center. */
export type CenterSetupUnit = {
  readonly center: Center;
  readonly defaultHours: readonly CenterHours[];
  readonly trial: CenterTrial | null;
};

/** Commits an initial center setup atomically in the infrastructure adapter. */
export interface CenterSetupUnitOfWork {
  commit(unit: CenterSetupUnit): Promise<void>;
}
