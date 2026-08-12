import type { CenterRepository } from '../ports/center-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanId } from '../plans/plans';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { applyWrite } from '../entities/write';
import { centerProfileSchema, type CenterProfileInput } from '../schemas/center';
import { CENTER_ID_PREFIX, type Center, type CenterId } from '../entities/center';
import type { SeedDefaultCenterHours } from './seed-default-center-hours';

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
 * On first creation it also seeds the center's default weekly hours (SOU-235)
 * through {@link SeedDefaultCenterHours}, so a brand-new center can schedule
 * sessions before the admin opens Settings. The seeder is idempotent, so an
 * update never re-seeds.
 */
export class SaveCenterProfile {
  constructor(
    private readonly centers: CenterRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly seedDefaultCenterHours: SeedDefaultCenterHours,
  ) {}

  async execute(input: SaveCenterProfileInput): Promise<Center> {
    const profile = centerProfileSchema.parse({
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
    });

    const existing = await this.centers.get();

    if (existing === null) {
      const center: Center = {
        id: this.ids.next(CENTER_ID_PREFIX) as CenterId,
        ...newEnvelope(
          {
            centerCode: input.centerCode,
            deviceOrigin: input.deviceOrigin,
            updatedBy: input.updatedBy,
          },
          this.clock,
        ),
        ...profile,
        logoPath: input.logoPath,
        plan: input.seedPlan,
      };
      await this.centers.save(center);
      await this.seedDefaultCenterHours.execute({
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        updatedBy: input.updatedBy,
      });
      return center;
    }

    const { next } = applyWrite(
      existing,
      { ...profile, logoPath: input.logoPath },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    await this.centers.save(next);
    return next;
  }
}
