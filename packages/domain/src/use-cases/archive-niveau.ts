import type { NiveauRepository } from '../ports/niveau-repository';
import type { NiveauReferencePort } from '../ports/niveau-reference';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { NiveauId } from '../entities/niveau';
import type { CenterCode, UserId } from '../value-objects/ids';
import { NiveauInUseError, NiveauNotFoundError } from '../errors/niveau-errors';

export type ArchiveNiveauInput = {
  centerCode: CenterCode;
  niveauId: NiveauId;
  updatedBy: UserId;
};

/**
 * Archives (soft-deletes) a Niveau. Gated by `core.niveaux`. The target is
 * center-scoped: the niveau is loaded first, and an unknown, already-archived,
 * or foreign-center id raises a typed {@link NiveauNotFoundError} before
 * anything is touched — so a stale or wrong-tenant id from the renderer can
 * never silently no-op as a success (mirrors `ArchiveSubject`). It then enforces
 * the ticket's in-use invariant: a niveau still referenced by any live Student,
 * Group, or Teacher cannot be archived — the guard consults the
 * `NiveauReferencePort` and rejects with a typed {@link NiveauInUseError}. When
 * the niveau is free it is soft-deleted (tombstone), never hard-deleted, so the
 * row still syncs. The delete timestamp comes from the injected `Clock` (UTC),
 * never `new Date()`, and the deleter's `updatedBy` is stamped on the tombstone
 * so a delete-vs-edit conflict can show *who* archived, not just when. The
 * `active` flag (deactivate **without** tombstoning) is toggled by
 * `UpdateNiveau` instead.
 */
export class ArchiveNiveau {
  constructor(
    private readonly niveaux: NiveauRepository,
    private readonly references: NiveauReferencePort,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveNiveauInput): Promise<void> {
    this.plan.require('core.niveaux');

    const existing = await this.niveaux.findById(input.niveauId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new NiveauNotFoundError(input.niveauId);
    }

    if (await this.references.isNiveauInUse(input.niveauId)) {
      throw new NiveauInUseError(input.niveauId);
    }

    await this.niveaux.softDelete(input.niveauId, this.clock.now(), input.updatedBy);
  }
}
