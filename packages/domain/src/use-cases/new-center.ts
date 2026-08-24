import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanId } from '../plans/plans';
import { newEnvelope, type NewEnvelopeInput } from '../entities/envelope';
import type { CenterProfileInput } from '../schemas/center';
import { CENTER_ID_PREFIX, type Center, type CenterId } from '../entities/center';

export type NewCenterInput = NewEnvelopeInput & {
  profile: CenterProfileInput;
  logoPath: string | null;
  /** Plan seeded onto the row once at creation (display-only mirror; see Center). */
  seedPlan: PlanId;
};

/**
 * Builds a brand-new center row with a fresh envelope and id. The single source
 * of the center-creation shape, shared by the first-run wizard (SaveCenterProfile)
 * and the add-a-center provisioning path (SOU-310) so both stamp identical
 * identity/plan fields. Pure — no persistence; the caller commits it.
 */
export function newCenter(input: NewCenterInput, clock: Clock, ids: IdGenerator): Center {
  const envelope: NewEnvelopeInput = {
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    updatedBy: input.updatedBy,
  };
  return {
    id: ids.next(CENTER_ID_PREFIX) as CenterId,
    ...newEnvelope(envelope, clock),
    ...input.profile,
    logoPath: input.logoPath,
    plan: input.seedPlan,
  };
}
