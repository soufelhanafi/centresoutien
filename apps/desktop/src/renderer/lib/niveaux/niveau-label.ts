import { useTranslation } from 'react-i18next';
import { useNiveauxAll } from '../../hooks/niveau/use-niveaux-all';
import { localizedNiveauName } from './niveau-view';

/**
 * Resolves a student/group's grade label from its `niveauId` at read time
 * (SOU-260), falling back to the legacy stored `level` when there is no niveau
 * assignment or the referenced niveau no longer resolves. Reading from the
 * catalog (not the denormalized copy) means a niveau rename or recode shows
 * correctly everywhere immediately — the persisted `level` stays only as the
 * backward-compatible fallback for pre-taxonomy data.
 */
export function useNiveauLabel(niveauId: string | null, fallbackLevel: string): string {
  const { i18n } = useTranslation();
  const allNiveaux = useNiveauxAll().data ?? [];
  if (niveauId === null) return fallbackLevel;
  const niveau = allNiveaux.find((n) => n.id === niveauId);
  return niveau ? localizedNiveauName(niveau.name, i18n.language) : fallbackLevel;
}
