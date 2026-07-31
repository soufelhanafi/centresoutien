import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { DuplicateTeacherError, TeacherNotFoundError } from '../errors/people-errors';
import type { Teacher, TeacherId } from '../entities/teacher';
import type { CenterCode, UserId } from '../value-objects/ids';

export type RestoreTeacherInput = {
  centerCode: CenterCode;
  id: TeacherId;
  updatedBy: UserId;
};

/**
 * Restores an archived teacher — clears its tombstone (`deletedAt = null`) so it
 * returns to the live list and the schedule pickers. Gated by `core.teachers`. The
 * target is read via `findArchivedById` (the only path that sees tombstones), and
 * an unknown, already-live, or foreign-center id raises {@link TeacherNotFoundError}
 * before anything is touched (mirrors `RestoreRoom`).
 *
 * Two teacher-specific guards sit on top of the room shape:
 * - Restoring brings a live teacher back, so it counts against the plan's
 *   `maxTeachers` limit just like `CreateTeacher` — otherwise
 *   archive-then-create-then-restore would silently exceed the cap.
 * - A teacher carries an immutable `naturalKey` under a partial UNIQUE index
 *   (live rows only). If a *live* teacher was created with the same key while this
 *   one was archived, reviving it would collide — so we reject with a typed
 *   {@link DuplicateTeacherError} instead of leaking a raw DB constraint. The
 *   archived row is its own tombstone, so `findByNaturalKey` (live-only) never
 *   matches it against itself.
 *
 * The clear-and-save reuses the ordinary write path: `updatedAt` (from the Clock
 * port, UTC) and `updatedBy` advance; `version` stays the hub's to assign; the id,
 * provenance, `createdAt`, and `naturalKey` are preserved.
 */
export class RestoreTeacher {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: RestoreTeacherInput): Promise<Teacher> {
    this.plan.require('core.teachers');

    const archived = await this.teachers.findArchivedById(input.id);
    if (archived === null || archived.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(input.id);
    }

    const activeCount = await this.teachers.countActive(input.centerCode);
    this.plan.requireBelowLimit('maxTeachers', activeCount);

    if (await this.teachers.findByNaturalKey(archived.naturalKey)) {
      throw new DuplicateTeacherError(archived.naturalKey);
    }

    const restored: Teacher = {
      ...archived,
      deletedAt: null,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    };
    await this.teachers.save(restored);
    return restored;
  }
}
