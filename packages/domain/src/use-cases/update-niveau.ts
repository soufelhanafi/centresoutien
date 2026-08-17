import type { NiveauRepository } from '../ports/niveau-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { niveauUpdateInputSchema, type NiveauUpdateInput } from '../schemas/niveau';
import { NiveauNotFoundError, DuplicateNiveauCodeError } from '../errors/niveau-errors';
import type { Niveau, NiveauCategory, NiveauId } from '../entities/niveau';
import type { CenterCode, UserId } from '../value-objects/ids';

export type UpdateNiveauInput = NiveauUpdateInput & {
  centerCode: CenterCode;
  id: NiveauId;
  updatedBy: UserId;
};

/**
 * Edits a Niveau's user-facing fields: its bilingual `name`, `category`, the
 * `code`, and the `active` flag (deactivate **and** reactivate, both
 * directions). Gated by `core.niveaux`. Validates with the shared
 * `niveauUpdateInputSchema` — the domain is the authority even though the form
 * validates first.
 *
 * `code` IS editable here (unlike `Subject.code`, which is a sync-relevant
 * natural key): the director asked for mutable codes (SOU-260), so the update
 * re-runs the per-center uniqueness guard against every other live niveau — an
 * unchanged or self-assigned code never collides, a live clash raises
 * {@link DuplicateNiveauCodeError}. The in-use / soft-delete protection is not
 * this use case's job — it stays owned by `ArchiveNiveau` + `NiveauInUseError`;
 * deactivating (`active = false`) is always allowed and preserves history.
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched. The write goes through
 * `applyWrite`, which advances `updatedAt` (from the Clock port) and `updatedBy`
 * and records the changed field names **only when something actually changed** —
 * a no-op edit returns the row untouched and emits no spurious sync delta. An
 * unknown, archived, or foreign-center id raises {@link NiveauNotFoundError}
 * rather than inserting a new row. Mirrors `UpdateSubject`.
 */
export class UpdateNiveau {
  constructor(
    private readonly niveaux: NiveauRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateNiveauInput): Promise<Niveau> {
    this.plan.require('core.niveaux');
    const { name, code, category, active } = niveauUpdateInputSchema.parse({
      name: input.name,
      code: input.code,
      category: input.category,
      active: input.active,
    });

    const existing = await this.niveaux.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new NiveauNotFoundError(input.id);
    }

    const normalizedCode = code ?? null;
    if (normalizedCode !== null && normalizedCode !== existing.code) {
      const clash = await this.niveaux.findByCode(input.centerCode, normalizedCode);
      if (clash !== null) {
        throw new DuplicateNiveauCodeError(normalizedCode);
      }
    }

    const { next, changedFields } = applyWrite(
      existing,
      {
        name,
        code: normalizedCode,
        category: category as NiveauCategory,
        active,
      },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.niveaux.save(next);
    }
    return next;
  }
}
