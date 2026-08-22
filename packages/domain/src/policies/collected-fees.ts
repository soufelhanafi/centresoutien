import type { InvoiceLine, InvoiceLineId } from '../entities/invoice-line';
import { apportionByWeight } from './apportion';

/**
 * Prorates an issued invoice's net-paid amount (centimes) across its lines,
 * weighted by each line's own billed amount, using the largest-remainder method
 * so the shares sum back to `min(netPaidMad, total)` exactly — CLAUDE.md §6 step
 * 4: only fees *actually collected* count toward teacher-fee attribution, and a
 * `partially-paid` invoice only contributes its paid portion.
 *
 * `netPaidMad` at or above the lines' total collects every line in full — the
 * `paid` case falls out of the same formula as `partially-paid`, so callers need
 * no separate branch. A zero-total invoice (fully discounted) collects nothing
 * regardless of `netPaidMad`, since there is no billed amount to divide it across.
 */
export function collectedLineAmounts(
  lines: readonly InvoiceLine[],
  netPaidMad: number,
): ReadonlyMap<InvoiceLineId, number> {
  const totalMad = lines.reduce((sum, line) => sum + line.amountMad, 0);
  if (totalMad <= 0) {
    return new Map(lines.map((line) => [line.id, 0]));
  }

  const effectiveNetMad = Math.max(0, Math.min(netPaidMad, totalMad));
  const shares = apportionByWeight(
    effectiveNetMad,
    lines.map((line) => line.amountMad),
  );

  return new Map(lines.map((line, index) => [line.id, shares[index] ?? 0]));
}
