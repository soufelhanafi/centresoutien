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
}
