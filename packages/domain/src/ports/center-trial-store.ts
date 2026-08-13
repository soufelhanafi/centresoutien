import type { CenterTrial } from '../plans/trial';

/**
 * Per-center, device-local trial persistence. This is deliberately outside the
 * synced entity model: a personal-sale trial belongs to this installed center,
 * not to its data replica history.
 */
export interface CenterTrialStore {
  get(): CenterTrial | null;
  save(trial: CenterTrial): void;
}
