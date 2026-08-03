import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { TeacherPayrollRule, TeacherPayrollRuleId } from '../entities/teacher-payroll-rule';
import type { TeacherId } from '../entities/teacher';

/**
 * Persistence port for TeacherPayrollRules. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete. Rules are identified by their
 * relationships, not people-like matching, so there is no `findByNaturalKey`,
 * and there is no editable `status` column — status is derived from the month
 * range.
 *
 * `listLiveByTeacher` feeds the at-most-one-active overlap guard in
 * `CreateTeacherPayrollRule` (checked across both kinds — a teacher's payroll
 * rule is not split by track like a student subscription) and, later, the
 * `TeacherReferencePort` / payout attribution reads. "Live" means a
 * non-tombstoned row.
 *
 * SQLite adapter + migration land in SOU-71 — this ticket declares the
 * contract only.
 */
export interface TeacherPayrollRuleRepository
  extends SoftDeletableRepository<TeacherPayrollRuleId, TeacherPayrollRule> {
  /**
   * Every **live** rule the teacher holds, newest start first — the candidate
   * set the at-most-one-active invariant checks a new rule's range against.
   */
  listLiveByTeacher(teacherId: TeacherId): Promise<readonly TeacherPayrollRule[]>;
  /**
   * Atomically persists a close-then-reopen pair (SOU-141): writes `closed`
   * (the just-capped live rule) and `created` (its replacement) so that the
   * close can **never** commit without its replacement. The adapter runs both
   * writes inside one SQLite transaction — a failure creating the replacement
   * rolls the close back, leaving the original rule live and untouched. The
   * caller (a `Replace*` use case) computes both entities before calling, so
   * this is a pure translation of intent with no business decisions here.
   */
  replaceLiveRule(closed: TeacherPayrollRule, created: TeacherPayrollRule): Promise<void>;
}
