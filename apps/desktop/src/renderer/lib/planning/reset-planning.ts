/**
 * Pure helpers for the director-facing "réinitialiser le planning" danger action
 * (SOU-295). The presentation layer owns the cutoff-date arithmetic because the
 * domain forbids wall-clock reads (CLAUDE.md §5): the renderer resolves the
 * operator's local civil "today" into the inclusive lower bound the reset use
 * case deletes from.
 */

/** Where the wipe starts: the local day itself, or the day after. */
export type CutoffChoice = 'include-today' | 'from-tomorrow';

/** Outcome of a reset, surfaced in the success toast (never persisted in the UI). */
export type PlanningResetResult = {
  readonly sessionsDeleted: number;
  readonly templatesDeleted: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addOneCivilDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(utc + MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The inclusive lower-bound civil date (`YYYY-MM-DD`) the reset deletes from.
 * "Inclure aujourd'hui" keeps `todayIso`; "À partir de demain" advances one day.
 */
export function computeCutoffDate(todayIso: string, choice: CutoffChoice): string {
  return choice === 'include-today' ? todayIso : addOneCivilDay(todayIso);
}

/**
 * Whether the typed danger-zone confirmation matches the required word. The gate
 * is trimmed and case-insensitive so trailing spaces or caps never trap a
 * director who typed the right word (the word itself is a translated token).
 */
export function isResetConfirmed(typed: string, expectedWord: string): boolean {
  return typed.trim().toLocaleUpperCase() === expectedWord.trim().toLocaleUpperCase();
}
