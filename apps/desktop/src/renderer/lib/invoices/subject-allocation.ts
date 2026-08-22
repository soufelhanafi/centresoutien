import { apportionByWeight } from '@centresoutien/domain';
import type { FormulaView } from '../formulas/formula-view';
import type { InvoiceListItemView, InvoiceSubjectAllocation } from './invoice-view';

/** The sum of an allocation vector, in centimes. */
export function sumAllocation(allocations: readonly InvoiceSubjectAllocation[]): number {
  return allocations.reduce((total, entry) => total + entry.amountMad, 0);
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
    const shares = apportionByWeight(line.amountMad, weights);
    formula.subjectIds.forEach((subjectId, index) => {
      bySubject.set(subjectId, (bySubject.get(subjectId) ?? 0) + (shares[index] ?? 0));
    });
  }

  return [...bySubject.entries()].map(([subjectId, amountMad]) => ({ subjectId, amountMad }));
}
