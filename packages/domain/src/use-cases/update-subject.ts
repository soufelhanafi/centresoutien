import type { SubjectRepository } from '../ports/subject-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { subjectUpdateInputSchema, type SubjectUpdateInput } from '../schemas/subject';
import { SubjectNotFoundError } from '../errors/subject-errors';
import type { Subject, SubjectId } from '../entities/subject';
import type { CenterCode, UserId } from '../value-objects/ids';

export type UpdateSubjectInput = SubjectUpdateInput & {
  centerCode: CenterCode;
  id: SubjectId;
  updatedBy: UserId;
};

/**
 * Edits a Subject's user-facing fields: its bilingual `name` and the `active`
 * flag (deactivate **and** reactivate, both directions). Gated by `core.subjects`.
 * Validates with the shared `subjectUpdateInputSchema` — the domain is the
 * authority even though the form validates first.
 *
 * `code` is intentionally NOT editable here: it is a sync-relevant natural key
 * (SOU-122), so it is absent from the schema and never patched — an unchanged
 * code cannot collide, which is why this use case needs no `findByCode` guard
 * (unlike `CreateSubject`). In-use / soft-delete protection is not this use
 * case's job either — it stays owned by `ArchiveSubject` + `SubjectInUseError`;
 * deactivating (`active = false`) is always allowed and preserves history.
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched — `version` is the hub's to
 * assign, so a local edit must not bump it. The write goes through `applyWrite`,
 * which advances `updatedAt` (from the Clock port) and `updatedBy` and records
 * the changed field names **only when something actually changed** — a no-op edit
 * returns the row untouched and emits no spurious sync delta. An unknown,
 * archived, or foreign-center id raises {@link SubjectNotFoundError} rather than
 * inserting a new row. Mirrors {@link UpdateGroup} / `UpdateRoom`.
 */
export class UpdateSubject {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateSubjectInput): Promise<Subject> {
    this.plan.require('core.subjects');
    const { name, active } = subjectUpdateInputSchema.parse({
      name: input.name,
      active: input.active,
    });

    const existing = await this.subjects.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new SubjectNotFoundError(input.id);
    }

    const { next, changedFields } = applyWrite(
      existing,
      { name, active },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.subjects.save(next);
    }
    return next;
  }
}
