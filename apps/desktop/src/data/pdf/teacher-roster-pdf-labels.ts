/** Static French copy + column layout for the teacher-roster PDF (SOU-299).
 *  FR-only, matching the SOU-279 money/document convention. */
export const teacherRosterPdfLabels = {
  title: 'Liste des élèves',
  generatedOn: (date: string): string => `Généré le ${date}`,
  count: (n: number): string => (n === 1 ? '1 élève' : `${n} élèves`),
  empty: 'Aucun élève pour cette sélection.',
  columns: {
    name: 'Élève',
    level: 'Niveau',
    subjects: 'Matière(s)',
    formula: 'Formule',
    kind: 'Type',
    status: 'Statut',
  },
  pageLabel: (page: number, total: number): string => `Page ${page} / ${total}`,
} as const;

/** Column weights (fractions of the content width). Sum is 1. */
export const TEACHER_ROSTER_COLUMN_WEIGHTS = {
  name: 0.27,
  level: 0.11,
  subjects: 0.24,
  formula: 0.2,
  kind: 0.09,
  status: 0.09,
} as const;
