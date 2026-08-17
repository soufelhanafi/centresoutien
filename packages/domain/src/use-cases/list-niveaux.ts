import type { NiveauRepository } from '../ports/niveau-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Niveau } from '../entities/niveau';

/**
 * Which slice of a center's niveaux to return. Both exclude tombstones — the
 * axis here is the `active` flag, not soft-delete: `'active'` is the picker set
 * (only usable niveaux), `'all'` also includes deactivated niveaux for
 * name-resolution and the manage screen. Mirrors `SubjectScope`.
 */
export type NiveauScope = 'active' | 'all';

export type ListNiveauxInput = {
  centerCode: CenterCode;
  scope: NiveauScope;
};

/**
 * Lists a center's niveaux for name resolution and the student/group/teacher
 * form pickers (SOU-260). Gated by `core.niveaux` (every plan; the guard still
 * has one home). `scope` selects the active picker set or every live niveau.
 * Ordering is by category (primaire → collège → lycée), then alphabetical by
 * French name — a stable, locale-agnostic default the use case owns, so it does
 * not depend on adapter row order (the in-memory fake and SQLite agree). This
 * is the lightweight name channel; the usage counts live on the separate
 * `ListNiveauxWithUsage`.
 */
export class ListNiveaux {
  constructor(
    private readonly niveaux: NiveauRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListNiveauxInput): Promise<readonly Niveau[]> {
    this.plan.require('core.niveaux');
    const niveaux =
      input.scope === 'active'
        ? await this.niveaux.listActive(input.centerCode)
        : await this.niveaux.listAll(input.centerCode);
    const categoryRank: Record<Niveau['category'], number> = {
      primaire: 0,
      college: 1,
      lycee: 2,
    };
    return [...niveaux].sort(
      (a, b) =>
        categoryRank[a.category] - categoryRank[b.category] || a.name.fr.localeCompare(b.name.fr),
    );
  }
}
