import type { FormulaView } from '../formulas/formula-view';
import type { InvoiceListItemView, InvoiceSubjectAllocation } from './invoice-view';

/** The sum of an allocation vector, in centimes. */
export function sumAllocation(allocations: readonly InvoiceSubjectAllocation[]): number {
  return allocations.reduce((total, entry) => total + entry.amountMad, 0);
}

/**
 * Splits `amount` (centimes) across `weights` proportionally, as integers that
 * sum back to `amount` exactly — the rounding remainder lands on the last slot.
 * Equal `weights` (all 1) give an even split; zero total weight falls back to an
 * even split so a line is never dropped.
 */
function splitAmount(amount: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const even = totalWeight <= 0;
  const shares = weights.map((weight, index) =>
    index === weights.length - 1
      ? 0
      : Math.round(amount * (even ? 1 / weights.length : weight / totalWeight)),
  );
  const assigned = shares.slice(0, -1).reduce((sum, share) => sum + share, 0);
  shares[shares.length - 1] = amount - assigned;
  return shares;
}

/**
 * The weighted default allocation (SOU-298) used to pre-fill the manual editor:
 * each invoice line's amount is split across its formula's subjects — by the
 * formula's per-subject price map when present, else evenly — and the slices are
 * aggregated by subject. Sums to the invoice total by construction, so it is a
 * sensible manual starting point. A line whose formula is missing from
 * `formulas` (not yet synced) is skipped rather than guessed.
 */
export function computeDefaultAllocation(
  invoice: InvoiceListItemView,
  formulas: readonly FormulaView[],
): InvoiceSubjectAllocation[] {
  const formulaById = new Map(formulas.map((formula) => [formula.id, formula]));
  const bySubject = new Map<string, number>();

  for (const line of invoice.lines) {
    const formula = formulaById.get(line.formulaId);
    if (formula === undefined || formula.subjectIds.length === 0) continue;
    const priceBySubject = new Map((formula.subjectPrices ?? []).map((price) => [price.subjectId, price.priceMad]));
    const weights = formula.subjectIds.map((subjectId) => priceBySubject.get(subjectId) ?? 0);
    const shares = splitAmount(line.amountMad, weights);
    formula.subjectIds.forEach((subjectId, index) => {
      bySubject.set(subjectId, (bySubject.get(subjectId) ?? 0) + (shares[index] ?? 0));
    });
  }

  return [...bySubject.entries()].map(([subjectId, amountMad]) => ({ subjectId, amountMad }));
}
