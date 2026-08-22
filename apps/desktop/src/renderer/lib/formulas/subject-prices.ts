import type { FormulaSubjectPrice } from './formula-view';

/**
 * The client-side validation outcomes of a formula's per-subject price map
 * (SOU-298). Each code mirrors one reason the domain's
 * `InvalidFormulaSubjectPricesError` carries, so the same `t(\`errors.${code}\`)`
 * line localizes a live client rejection and a server-rejected save alike.
 */
export type FormulaSubjectPricesErrorCode =
  | 'formula-subject-prices-coverage-mismatch'
  | 'formula-subject-prices-invalid-amount'
  | 'formula-subject-prices-sum-mismatch';

/** The sum of a price map's entries, in centimes (NaN entries counted as 0). */
export function sumSubjectPrices(prices: readonly FormulaSubjectPrice[]): number {
  return prices.reduce((total, price) => total + (Number.isFinite(price.priceMad) ? price.priceMad : 0), 0);
}

/**
 * Validates a per-subject price map against the selected subjects and the bundle
 * total, in the same order the domain checks: every selected subject is priced
 * exactly once (coverage), each amount is a positive integer, and the amounts sum
 * to the bundle total. Returns the first failing code, or `null` when the map is
 * valid. Pure — reused by the form schema's refine and its unit tests.
 */
export function validateSubjectPrices(params: {
  readonly subjectIds: readonly string[];
  readonly subjectPrices: readonly FormulaSubjectPrice[];
  readonly totalMad: number;
}): FormulaSubjectPricesErrorCode | null {
  const { subjectIds, subjectPrices, totalMad } = params;
  const pricedSubjectIds = new Set(subjectPrices.map((price) => price.subjectId));
  const coversExactly =
    subjectPrices.length === subjectIds.length &&
    pricedSubjectIds.size === subjectPrices.length &&
    subjectIds.every((id) => pricedSubjectIds.has(id));
  if (!coversExactly) return 'formula-subject-prices-coverage-mismatch';

  const everyAmountValid = subjectPrices.every(
    (price) => Number.isInteger(price.priceMad) && price.priceMad > 0,
  );
  if (!everyAmountValid) return 'formula-subject-prices-invalid-amount';

  if (!Number.isInteger(totalMad) || sumSubjectPrices(subjectPrices) !== totalMad) {
    return 'formula-subject-prices-sum-mismatch';
  }
  return null;
}
