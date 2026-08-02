import type { SubjectRepository } from '../ports/subject-repository';
import type { SubjectId } from '../entities/subject';
import type { CenterCode } from '../value-objects/ids';
import { FormulaSubjectUnavailableError } from '../errors/formula-errors';

/**
 * Confirms every id in a formula's `subjectIds` bundle resolves to a live,
 * active Subject of the same center — an invariant of a Formula at rest, not
 * just at creation, so `CreateFormula`, `UpdateFormula`, and `CloneFormula` all
 * call this before writing (mirrors `CreateGroup`/`UpdateGroup`'s single-subject
 * check, extended to an array). Throws {@link FormulaSubjectUnavailableError} on
 * the first unresolved or inactive id.
 */
export async function validateFormulaSubjects(
  subjectIds: readonly SubjectId[],
  centerCode: CenterCode,
  subjects: SubjectRepository,
): Promise<void> {
  for (const subjectId of subjectIds) {
    const subject = await subjects.findById(subjectId);
    if (subject === null || subject.centerCode !== centerCode) {
      throw new FormulaSubjectUnavailableError(subjectId, 'not-found');
    }
    if (!subject.active) {
      throw new FormulaSubjectUnavailableError(subjectId, 'inactive');
    }
  }
}
