import type { CenterRepository } from "../ports/center-repository";
import type { CenterSetupUnitOfWork } from "../ports/center-setup-unit-of-work";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { LicenseAccess } from "../ports/license-access";
import type { PlanId } from "../plans/plans";
import { newCenterTrial } from "../plans/trial";
import type { CenterCode, DeviceId, UserId } from "../value-objects/ids";
import { newEnvelope } from "../entities/envelope";
import { applyWrite } from "../entities/write";
import {
  centerProfileSchema,
  type CenterProfileInput,
} from "../schemas/center";
import {
  CENTER_ID_PREFIX,
  type Center,
  type CenterId,
} from "../entities/center";
import { newDefaultCenterHours } from "./seed-default-center-hours";

export type SaveCenterProfileInput = CenterProfileInput & {
  logoPath: string | null;
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** Plan seeded onto the row the first time the center is created (interim; see Center). */
  seedPlan: PlanId;
};

/**
 * Upserts the single center row. First save creates it (fresh envelope, plan
 * seeded once); later saves patch the profile fields through {@link applyWrite}
 * so `updatedAt`/`updatedBy` and the per-field change log stay correct for sync.
 * The `plan` and identity fields are never touched on update. Every-plan
 * feature — no plan gate.
 *
 * On first creation it atomically persists the center, default weekly hours,
 * and (only when no valid license exists) the initial trial. An update never
 * re-seeds hours or backfills a trial for an existing center.
 */
export class SaveCenterProfile {
  constructor(
    private readonly centers: CenterRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly setup: CenterSetupUnitOfWork,
    private readonly licenseAccess: LicenseAccess,
  ) {}

  async execute(input: SaveCenterProfileInput): Promise<Center> {
    const profile = parseProfile(input);
    const existing = await this.centers.get();
    return existing === null
      ? this.createInitialCenter(input, profile)
      : this.updateExistingCenter(existing, input, profile);
  }

  private async createInitialCenter(
    input: SaveCenterProfileInput,
    profile: CenterProfileInput,
  ): Promise<Center> {
    const center = this.newCenter(input, profile);
    const context = centerContext(input);
    await this.setup.commit({
      center,
      defaultHours: newDefaultCenterHours(context, this.clock, this.ids),
      trial: this.licenseAccess.hasActiveLicense()
        ? null
        : newCenterTrial(this.clock.now()),
    });
    return center;
  }

  private newCenter(
    input: SaveCenterProfileInput,
    profile: CenterProfileInput,
  ): Center {
    return {
      id: this.ids.next(CENTER_ID_PREFIX) as CenterId,
      ...newEnvelope(centerContext(input), this.clock),
      ...profile,
      logoPath: input.logoPath,
      plan: input.seedPlan,
    };
  }

  private async updateExistingCenter(
    existing: Center,
    input: SaveCenterProfileInput,
    profile: CenterProfileInput,
  ): Promise<Center> {
    const { next } = applyWrite(
      existing,
      { ...profile, logoPath: input.logoPath },
      {
        clock: this.clock,
        updatedBy: input.updatedBy,
      },
    );
    await this.centers.save(next);
    return next;
  }
}

function parseProfile(input: CenterProfileInput): CenterProfileInput {
  return centerProfileSchema.parse(input);
}

function centerContext(input: SaveCenterProfileInput) {
  return {
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    updatedBy: input.updatedBy,
  };
}
