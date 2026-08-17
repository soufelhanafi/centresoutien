import type { StudentView } from './student-view';

/** Distinct levels present in the list, sorted for the filter dropdown. */
export function deriveLevels(students: readonly StudentView[]): string[] {
  return [...new Set(students.map((s) => s.level))].sort((a, b) => a.localeCompare(b));
}

/** Client-side level filter layered on top of the gateway's search. */
export function filterByLevel(
  students: readonly StudentView[],
  level: string,
): readonly StudentView[] {
  return level === '' ? students : students.filter((s) => s.level === level);
}

/** Client-side niveau filter layered on top of the gateway's search. */
export function filterByNiveau(
  students: readonly StudentView[],
  niveauId: string,
): readonly StudentView[] {
  return niveauId === '' ? students : students.filter((s) => s.niveauId === niveauId);
}
