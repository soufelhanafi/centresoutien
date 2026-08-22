import type { MultiCenterStatsRawRow } from '../ports/multi-center-stats-read-port';
import type {
  MultiCenterStatsRow,
  MultiCenterStatsTotals,
  MultiCenterStatsView,
} from '../read-models/multi-center-stats-view';

/**
 * Pure derivation of the per-center stats view (SOU-106) from the raw per-center
 * rows the read port returns. Kept out of both the port (which stays dumb) and the
 * use case (which stays a thin plan-gate + clock wrapper) so the rate math is one
 * directly unit-tested place. All money is integer MAD centimes; conventions
 * mirror {@link DashboardBasicSummary} verbatim.
 */

/** `(billed − collected) / billed`, clamped to `[0,1]` intent and rounded to 4
 *  decimals; `null` when `billed` is 0 (no month billed → no rate, not a 0% rate). */
export function deriveUnpaidRate(billedMad: number, collectedMad: number): number | null {
  if (billedMad === 0) return null;
  return Math.round(((billedMad - collectedMad) / billedMad) * 10000) / 10000;
}

/** Collected-revenue % move vs the previous month, rounded to 1 decimal; `null`
 *  when the previous baseline is 0 — the same null-baseline rule as the dashboard's
 *  `deltaPercent`, so a center with no prior revenue shows "no baseline", not ∞%. */
export function deriveMomGrowthPercent(
  currentCollectedMad: number,
  previousCollectedMad: number,
): number | null {
  if (previousCollectedMad === 0) return null;
  return Math.round(((currentCollectedMad - previousCollectedMad) / previousCollectedMad) * 1000) / 10;
}

function toRow(raw: MultiCenterStatsRawRow): MultiCenterStatsRow {
  return {
    centreId: raw.centreId,
    centerCode: raw.centerCode,
    displayName: raw.displayName,
    revenueMad: raw.billedMad,
    collectedMad: raw.collectedMad,
    studentCount: raw.studentCount,
    unpaidRate: deriveUnpaidRate(raw.billedMad, raw.collectedMad),
    momGrowthPercent: deriveMomGrowthPercent(raw.collectedMad, raw.previousCollectedMad),
    unavailable: raw.unavailable,
  };
}

function totalsOf(rawRows: readonly MultiCenterStatsRawRow[]): MultiCenterStatsTotals {
  let revenueMad = 0;
  let collectedMad = 0;
  let studentCount = 0;
  let availableCenterCount = 0;
  for (const raw of rawRows) {
    if (raw.unavailable) continue;
    availableCenterCount += 1;
    revenueMad += raw.billedMad;
    collectedMad += raw.collectedMad;
    studentCount += raw.studentCount;
  }
  return {
    centerCount: rawRows.length,
    availableCenterCount,
    revenueMad,
    collectedMad,
    studentCount,
    unpaidRate: deriveUnpaidRate(revenueMad, collectedMad),
  };
}

export function buildMultiCenterStatsView(
  month: string,
  rawRows: readonly MultiCenterStatsRawRow[],
): MultiCenterStatsView {
  return { month, rows: rawRows.map(toRow), totals: totalsOf(rawRows) };
}
