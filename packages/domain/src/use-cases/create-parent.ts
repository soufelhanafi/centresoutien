import type { ParentRepository } from '../ports/parent-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { normalizeNaturalKey } from '../policies/natural-key';
import { parentInputSchema, type ParentInput } from '../schemas/parent';
import { PARENT_ID_PREFIX, type Parent, type ParentId } from '../entities/parent';

export type CreateParentInput = ParentInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Parent/guardian for a center. Gated by `core.parents` — the guard is
 * the single source of truth for whether the feature is reachable (see the
 * plan-gate note on the ticket). Validates its input with the shared
 * `parentInputSchema` (phone required + normalized to E.164), then stamps the
 * immutable `naturalKey` from the canonical phone so parents-first duplicate
 * matching has its anchor. A shared family phone is allowed: a different name
 * yields a different key, so both guardians save.
 */
export class CreateParent {
  constructor(
    private readonly parents: ParentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateParentInput): Promise<Parent> {
    this.plan.require('core.parents');
    const fields = parentInputSchema.parse({
      name: input.name,
      phone: input.phone,
      email: input.email,
      relation: input.relation,
      whatsappOptIn: input.whatsappOptIn,
    });

    const parent: Parent = {
      id: this.ids.next(PARENT_ID_PREFIX) as ParentId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      naturalKey: normalizeNaturalKey({
        centerCode: input.centerCode,
        fullName: fields.name,
        contact: fields.phone,
      }),
      name: fields.name,
      phone: fields.phone,
      email: fields.email,
      relation: fields.relation,
      whatsappOptIn: fields.whatsappOptIn,
    };

    await this.parents.save(parent);
    return parent;
  }
}
