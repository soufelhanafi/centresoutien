import type { NiveauInput, NiveauUpdateInput } from '@centresoutien/domain';
import type { NiveauCategory } from '@centresoutien/domain';
import type { NiveauDto, NiveauUsageDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Niveau` as it crosses the IPC boundary (SOU-260)
 * — the sync envelope (version, deviceOrigin, updatedBy…) and `Date`s are stripped
 * in main, exactly like `SubjectView`. The renderer never handles the raw entity.
 *
 * A direct alias of the boundary's `niveauViewSchema` (the single source of truth
 * in `shared/ipc/contract`), so the renderer shape can never drift from what the
 * `niveau.list` / `niveau.get` channels return.
 */
export type NiveauView = NiveauDto;

/** Read scope for the niveau list channel — `active` or `all`, mirroring `SubjectScope`. */
export type NiveauScope = 'active' | 'all';

/**
 * A niveau paired with its in-use reference count and named breakdown, as
 * returned by `niveau.listWithUsage` (SOU-260). A direct alias of the boundary's
 * `niveauUsageViewSchema` so the manage screen's shape can never drift from what
 * the channel actually returns.
 */
export type NiveauUsageView = NiveauUsageDto;

/** The category band (primaire / collège / lycée) as the domain declares it. */
export type NiveauCategoryView = NiveauCategory;

/** The editable fields when creating a niveau — the domain's own schema. */
export type { NiveauInput };

/** The editable fields when renaming / re-categorizing / toggling a niveau — the domain's own schema. */
export type { NiveauUpdateInput };

/**
 * A level's name in the active locale (Arabic under `ar`, French otherwise). The Arabic side may be
 * empty since SOU-271, so a single-label display falls back to French to stay identifiable (display-only).
 */
export function localizedNiveauName(name: NiveauDto['name'], locale: string): string {
  return (locale === 'ar' ? name.ar : name.fr) || name.fr;
}
