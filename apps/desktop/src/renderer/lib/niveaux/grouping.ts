import { NIVEAU_CATEGORIES, type NiveauCategory } from '@centresoutien/domain';
import type { NiveauUsageView } from './niveau-view';

/** A category's section: its levels sorted by code (null codes last). */
export type NiveauCategoryGroup = {
  readonly category: NiveauCategory;
  readonly niveaux: readonly NiveauUsageView[];
};

/** A stable code string for sorting within a category (null → ""). */
function sortKey(niveau: NiveauUsageView): string {
  return (niveau.niveau.code ?? '').toUpperCase();
}

/**
 * Groups levels by category in the fixed PRIMAIRE → COLLÈGE → LYCÉE order the
 * manage screen renders, each section's rows sorted by code. Empty categories
 * are kept (a center may not have defined collège levels yet — the section then
 * renders its empty state rather than vanishing).
 */
export function groupNiveauxByCategory(niveaux: readonly NiveauUsageView[]): readonly NiveauCategoryGroup[] {
  return NIVEAU_CATEGORIES.map((category) => ({
    category,
    niveaux: niveaux
      .filter((usage) => usage.niveau.category === category)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
  }));
}

/** Total reference count across students, groups, and teachers (drives the archive guard). */
export function totalNiveauUsage(usage: NiveauUsageView): number {
  return usage.inUseCount;
}
