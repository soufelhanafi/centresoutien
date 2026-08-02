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
}
