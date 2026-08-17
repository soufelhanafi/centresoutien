import type { NiveauRepository } from '../ports/niveau-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Niveau, NiveauId } from '../entities/niveau';

export type GetNiveauInput = { centerCode: CenterCode; id: NiveauId };

/**
 * Loads a single niveau by id for name resolution (SOU-260). Gated by
 * `core.niveaux`. Returns `null` for an unknown or soft-deleted id — the
 * repository read already hides tombstones, so "archived" and "never existed"
 * collapse to the same not-found the caller renders (a dash, not an error).
 *
 * The result is **center-scoped**: a row whose `centerCode` differs from the
 * caller's is treated as not-found — the portable-core tenant guard, exactly as
 * `GetSubject`. Mirrors `GetSubject`.
 */
export class GetNiveau {
  constructor(
    private readonly niveaux: NiveauRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetNiveauInput): Promise<Niveau | null> {
    this.plan.require('core.niveaux');
    const niveau = await this.niveaux.findById(input.id);
    return niveau && niveau.centerCode === input.centerCode ? niveau : null;
  }
}
