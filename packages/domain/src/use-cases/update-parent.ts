import type { ParentRepository } from '../ports/parent-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { parentInputSchema, type ParentInput } from '../schemas/parent';
import { ParentNotFoundError } from '../errors/people-errors';
import type { Parent, ParentId } from '../entities/parent';

export type UpdateParentInput = ParentInput & {
  centerCode: CenterCode;
  id: ParentId;
  updatedBy: UserId;
};

/**
 * Edits an existing guardian's user-facing fields. Gated by `core.parents`.
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched, and — per the entity contract —
 * the `naturalKey` is **not** recomputed even when the name or phone change, so
 * the duplicate engine keeps matching on the original key (and the partial-unique
 * index never trips on an edit). Only `updatedAt` (from the Clock port) and
 * `updatedBy` advance. Unknown or archived ids raise {@link ParentNotFoundError}
 * rather than silently inserting a new row.
 */
export class UpdateParent {
  constructor(
    private readonly parents: ParentRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateParentInput): Promise<Parent> {
    this.plan.require('core.parents');
    const fields = parentInputSchema.parse({
      name: input.name,
      phone: input.phone,
      email: input.email,
      relation: input.relation,
      whatsappOptIn: input.whatsappOptIn,
    });

    const existing = await this.parents.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new ParentNotFoundError(input.id);
    }

    const updated: Parent = {
      ...existing,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
      name: fields.name,
      phone: fields.phone,
      email: fields.email,
      relation: fields.relation,
      whatsappOptIn: fields.whatsappOptIn,
    };

    await this.parents.save(updated);
    return updated;
  }
}
