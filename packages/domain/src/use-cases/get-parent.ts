import type { ParentRepository } from '../ports/parent-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Parent, ParentId } from '../entities/parent';

export type GetParentInput = { centerCode: CenterCode; id: ParentId };

/**
 * Loads a single guardian by id for the detail sheet. Gated by `core.parents`.
 * Returns `null` for an unknown or soft-deleted id — the repository read already
 * hides tombstones, so "archived" and "never existed" collapse to the same
 * not-found the UI renders.
 *
 * The result is **center-scoped**: a row whose `centerCode` differs from the
 * caller's is treated as not-found. On desktop the one-DB-per-center boundary
 * makes this redundant, but the domain is the portable core — the same use case
 * runs on the future shared-Postgres backend where an id alone is not a tenant
 * guard, so the check lives here, not in the adapter.
 */
export class GetParent {
  constructor(
    private readonly parents: ParentRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetParentInput): Promise<Parent | null> {
    this.plan.require('core.parents');
    const parent = await this.parents.findById(input.id);
    return parent && parent.centerCode === input.centerCode ? parent : null;
  }
}
