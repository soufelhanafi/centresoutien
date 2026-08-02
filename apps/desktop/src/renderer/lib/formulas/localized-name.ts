import type { FormulaView } from './formula-view';

/** A formula's name in the active locale (Arabic under `ar`, French otherwise). */
export function localizedFormulaName(name: FormulaView['name'], locale: string): string {
  return locale === 'ar' ? name.ar : name.fr;
}
