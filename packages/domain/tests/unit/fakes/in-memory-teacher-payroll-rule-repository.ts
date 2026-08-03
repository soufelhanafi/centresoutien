import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { TeacherPayrollRuleRepository } from '../../../src/ports/teacher-payroll-rule-repository';
import type {
  TeacherPayrollRule,
  TeacherPayrollRuleId,
} from '../../../src/entities/teacher-payroll-rule';
import type { TeacherId } from '../../../src/entities/teacher';

/**
 * In-memory {@link TeacherPayrollRuleRepository} for unit tests. Inherits the
 * soft-deletable base and adds `listLiveByTeacher`, mirroring the semantics the
 * SQLite adapter (SOU-71) must uphold: excludes tombstones, newest start first.
 */
export class InMemoryTeacherPayrollRuleRepository
  extends InMemorySoftDeletableRepository<TeacherPayrollRuleId, TeacherPayrollRule>
  implements TeacherPayrollRuleRepository
{
  async listLiveByTeacher(teacherId: TeacherId): Promise<readonly TeacherPayrollRule[]> {
    return this.all()
      .filter((rule) => rule.deletedAt === null && rule.teacherId === teacherId)
      .sort((a, b) => b.startMonth.localeCompare(a.startMonth));
  }

  /**
   * Faithful atomic model of the SQLite adapter's `db.transaction` (SOU-141): if
   * writing the created rule throws, the closed rule's write is rolled back so
   * the incumbent stays live — the close can never commit without its
   * replacement. An `InMemory` subclass that overrides `save` to throw on a
   * specific id can therefore exercise the rollback path in a unit test.
   */
  async replaceLiveRule(closed: TeacherPayrollRule, created: TeacherPayrollRule): Promise<void> {
    const before = new Map(this.rows);
    try {
      await this.save(closed);
      await this.save(created);
    } catch (err) {
      this.rows.clear();
      for (const [id, row] of before) this.rows.set(id, structuredClone(row));
      throw err;
    }
  }
}
