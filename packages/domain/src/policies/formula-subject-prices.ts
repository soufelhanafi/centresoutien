import type { SubjectId } from '../entities/subject';
import type { FormulaSubjectPrice } from '../entities/formula';
import { InvalidFormulaSubjectPricesError } from '../errors/formula-errors';

/**
 * Enforces the Formula per-subject price-map invariant (SOU-298) when a map is
 * supplied: every amount is a positive integer number of MAD centimes, the map
 * covers **exactly** `subjectIds` (no missing, extra, or duplicated subject), and
 * the amounts sum to `priceMad`. An empty/absent map is legal — it means the
 * center hasn't priced subjects individually and attribution falls back to the
 * equal split — so this is a no-op for `undefined`/`[]`.
 *
 * Throws {@link InvalidFormulaSubjectPricesError} with the specific reason so the
 * renderer can steer the director to the offending field. Called by every Formula
 * write path (`CreateFormula`, `UpdateFormula`, `CloneFormula`) — the map is an
 * invariant of the Formula at rest, not just at first creation.
 */
export function assertValidFormulaSubjectPrices(
  subjectIds: readonly SubjectId[],
  priceMad: number,
  subjectPrices: readonly FormulaSubjectPrice[] | undefined,
): void {
  if (subjectPrices === undefined || subjectPrices.length === 0) return;

  const pricedSubjects = new Set<SubjectId>();
  let sum = 0;
  for (const entry of subjectPrices) {
    if (!Number.isInteger(entry.priceMad) || entry.priceMad <= 0) {
      throw new InvalidFormulaSubjectPricesError('invalid-amount');
    }
    if (pricedSubjects.has(entry.subjectId)) {
      throw new InvalidFormulaSubjectPricesError('coverage-mismatch');
    }
    pricedSubjects.add(entry.subjectId);
    sum += entry.priceMad;
  }

  const expectedSubjects = new Set(subjectIds);
  if (pricedSubjects.size !== expectedSubjects.size) {
    throw new InvalidFormulaSubjectPricesError('coverage-mismatch');
  }
  for (const subjectId of pricedSubjects) {
    if (!expectedSubjects.has(subjectId)) {
      throw new InvalidFormulaSubjectPricesError('coverage-mismatch');
    }
  }

  if (sum !== priceMad) {
    throw new InvalidFormulaSubjectPricesError('sum-mismatch');
  }
}
