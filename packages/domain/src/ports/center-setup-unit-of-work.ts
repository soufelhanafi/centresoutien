import type { Center } from '../entities/center';
import type { CenterHours } from '../entities/center-hours';
import type { Niveau } from '../entities/niveau';
import type { Organization } from '../entities/organization';
import type { Membership } from '../entities/membership';
import type { CenterTrial } from '../plans/trial';

/**
 * All durable records that must appear together for a newly configured center.
 *
 * `organization` + `membership` are the ownership rows seeded only when a center
 * is created with a signed-in director (the add-a-center flow, SOU-310). They are
 * `null` at first-run, where the owner user does not exist yet — an absent owner
 * cannot be granted a membership.
 */
export type CenterSetupUnit = {
  readonly center: Center;
  readonly defaultHours: readonly CenterHours[];
  readonly defaultNiveaux: readonly Niveau[];
  readonly trial: CenterTrial | null;
  readonly organization: Organization | null;
  readonly membership: Membership | null;
};

/** Commits an initial center setup atomically in the infrastructure adapter. */
export interface CenterSetupUnitOfWork {
  commit(unit: CenterSetupUnit): Promise<void>;
}
