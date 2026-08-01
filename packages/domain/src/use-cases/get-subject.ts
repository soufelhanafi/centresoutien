import type { SubjectRepository } from '../ports/subject-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Subject, SubjectId } from '../entities/subject';

export type GetSubjectInput = { centerCode: CenterCode; id: SubjectId };

/**
 * Loads a single subject by id for name resolution (SOU-124). Gated by
 * `core.subjects`. Returns `null` for an unknown or soft-deleted id — the
 * repository read already hides tombstones, so "archived" and "never existed"
 * collapse to the same not-found the caller renders (a dash, not an error).
 *
 * The result is **center-scoped**: a row whose `centerCode` differs from the
 * caller's is treated as not-found. On desktop the one-DB-per-center boundary
 * makes this redundant, but the domain is the portable core — the same use case
 * runs on the future shared-Postgres backend where an id alone is not a tenant
 * guard, so the check lives here, not in the adapter. Mirrors `GetTeacher`.
 */
export class GetSubject {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetSubjectInput): Promise<Subject | null> {
    this.plan.require('core.subjects');
    const subject = await this.subjects.findById(input.id);
    return subject && subject.centerCode === input.centerCode ? subject : null;
  }
}
