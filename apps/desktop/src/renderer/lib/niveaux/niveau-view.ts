import type { Niveau, NiveauCategory, NiveauId, NiveauInput, NiveauUpdateInput, NiveauUsage } from '../niveau-contract';

// TEMP: aliases so the UI imports from one place; on SOU-260 merge these point
// at the domain export directly and `niveau-contract.ts` is deleted.
export type NiveauView = Niveau;
export type NiveauUsageView = NiveauUsage;
export type NiveauCategoryView = NiveauCategory;
export type NiveauIdView = NiveauId;
export type { NiveauInput, NiveauUpdateInput };

/** A level's name in the active locale (Arabic under `ar`, French otherwise). */
export function localizedNiveauName(name: Niveau['name'], locale: string): string {
  return locale === 'ar' ? name.ar : name.fr;
}
