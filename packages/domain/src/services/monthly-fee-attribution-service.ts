import type { CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type { SubjectId } from '../entities/subject';
import type { StudentLineAttributionInput } from '../policies/teacher-fee-attribution-policy';
import { TeacherFeeAttributionPolicy } from '../policies/teacher-fee-attribution-policy';
import { SubjectRevenueAttributionPolicy } from '../policies/subject-revenue-attribution-policy';
import type { AttributionLineAssembler } from './attribution-line-assembler';

/**
 * Attributes a center+month's fees to teachers (and subjects), on top of the
 * line assembly in {@link AttributionLineAssembler}. The assembly (which
 * invoices count, and how each line's amount resolves to teachers) lives in the
 * assembler; this service applies the pure split policy to those lines. Only
 * the `issued`+collected ledger is read by the collected views; the projected
 * view (SOU-316) reads the full-amount ledger instead.
 */
export class MonthlyFeeAttributionService {
  constructor(private readonly lines: AttributionLineAssembler) {}

  async attributedAmountsByTeacher(
    centerCode: CenterCode,
    month: string,
  ): Promise<ReadonlyMap<TeacherId, number>> {
    const inputLines = await this.collectAttributionLines(centerCode, month);
    if (inputLines.length === 0) return new Map();

    const attributed = TeacherFeeAttributionPolicy.attribute(inputLines);
    return new Map(attributed.map((entry) => [entry.teacherId, entry.attributedAmountMad]));
  }

  /** Same collected-fee lines as {@link attributedAmountsByTeacher}, grouped by subject (SOU-100). */
  async attributedAmountsBySubject(
    centerCode: CenterCode,
    month: string,
  ): Promise<ReadonlyMap<SubjectId, number>> {
    const inputLines = await this.collectAttributionLines(centerCode, month);
    if (inputLines.length === 0) return new Map();

    const attributed = SubjectRevenueAttributionPolicy.attribute(inputLines);
    return new Map(attributed.map((entry) => [entry.subjectId, entry.attributedAmountMad]));
  }

  /** Same attribution base as {@link attributedAmountsByTeacher}, broken out by subject (SOU-76 drill-down). */
  async attributedAmountsByTeacherAndSubject(
    centerCode: CenterCode,
    month: string,
  ): Promise<ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>>> {
    const inputLines = await this.collectAttributionLines(centerCode, month);
    if (inputLines.length === 0) return new Map();

    return this.attributeByTeacherAndSubject(inputLines);
  }

  /**
   * The projected (expected, not-yet-collected) counterpart of
   * {@link attributedAmountsByTeacherAndSubject} — the in-progress payroll
   * projection's subject basis (SOU-316). Reads every non-cancelled invoice at
   * its full line amount, then resolves teachers exactly as the collected path.
   */
  async projectedAttributedAmountsByTeacherAndSubject(
    centerCode: CenterCode,
    month: string,
  ): Promise<ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>>> {
    const inputLines = await this.collectProjectedLines(centerCode, month);
    if (inputLines.length === 0) return new Map();

    return this.attributeByTeacherAndSubject(inputLines);
  }

  private collectAttributionLines(
    centerCode: CenterCode,
    month: string,
  ): Promise<StudentLineAttributionInput[]> {
    return this.lines.collectCollectedLines(centerCode, month);
  }

  private collectProjectedLines(
    centerCode: CenterCode,
    month: string,
  ): Promise<StudentLineAttributionInput[]> {
    return this.lines.collectProjectedLines(centerCode, month);
  }

  private attributeByTeacherAndSubject(
    inputLines: StudentLineAttributionInput[],
  ): ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>> {
    const attributed = TeacherFeeAttributionPolicy.attributeBySubject(inputLines);
    const byTeacher = new Map<TeacherId, Map<SubjectId, number>>();
    for (const entry of attributed) {
      const bySubject = byTeacher.get(entry.teacherId) ?? new Map<SubjectId, number>();
      bySubject.set(entry.subjectId, entry.attributedAmountMad);
      byTeacher.set(entry.teacherId, bySubject);
    }
    return byTeacher;
  }
}
