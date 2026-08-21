import type { GetCenterProfile, ReadCenterLogo, TeacherRosterPdfInput, TeacherRosterPdfRow } from '@centresoutien/domain';
import type { IpcRequest } from '../../shared/ipc/contract';
import { formatMonthLabel } from '../../data/pdf/format-month';

export type TeacherRosterAssemblyDeps = {
  getCenterProfile: Pick<GetCenterProfile, 'execute'>;
  readCenterLogo: Pick<ReadCenterLogo, 'execute'>;
};

type TeacherRosterPdfRequest = IpcRequest<'teacher.roster.export'>;
type TeacherRosterRowDto = TeacherRosterPdfRequest['rows'][number];

const KIND_LABEL_FR: Record<'regular' | 'exam-prep', string> = {
  regular: 'Régulier',
  'exam-prep': 'Examen',
};
const STATUS_FILTER_LABEL_FR: Record<'active' | 'left', string> = {
  active: 'Inscrits',
  left: 'Partis',
};

function toKindLabel(kinds: readonly ('regular' | 'exam-prep')[]): string {
  return kinds.map((kind) => KIND_LABEL_FR[kind]).join(', ');
}

function toStatusLabel(row: TeacherRosterRowDto): string {
  if (row.status === 'active') return 'Inscrit(e)';
  return row.leftMonth ? `Parti(e) — ${formatMonthLabel(row.leftMonth, 'fr')}` : 'Parti(e)';
}

function toPdfRow(row: TeacherRosterRowDto): TeacherRosterPdfRow {
  return {
    name: row.name.fr,
    level: row.level || '—',
    subjects: row.subjects.map((subject) => subject.name.fr).join(', ') || '—',
    formula: row.formulaLabel || '—',
    kind: toKindLabel(row.kinds) || '—',
    status: toStatusLabel(row),
  };
}

function toFilterSummary(filters: TeacherRosterPdfRequest['filters']): readonly string[] {
  const lines: string[] = [];
  if (filters.subjectName) lines.push(`Matière : ${filters.subjectName}`);
  if (filters.groupLabel) lines.push(`Groupe : ${filters.groupLabel}`);
  if (filters.nameQuery.trim()) lines.push(`Recherche : « ${filters.nameQuery.trim()} »`);
  if (filters.status !== 'all') lines.push(`Statut : ${STATUS_FILTER_LABEL_FR[filters.status]}`);
  return lines;
}

/** Assembles the {@link TeacherRosterPdfRenderer} input from the print/export
 *  request the renderer sends (the rows it displays + the active filter) and the
 *  resolved center profile. Pure DTO assembly — no business decisions; the roster
 *  is already derived by `GetTeacherRoster`. FR-only labels are composed here. */
export async function buildTeacherRosterPdfInput(
  deps: TeacherRosterAssemblyDeps,
  request: TeacherRosterPdfRequest,
): Promise<TeacherRosterPdfInput> {
  const center = await deps.getCenterProfile.execute();
  const logoBytes = center?.logoPath ? await deps.readCenterLogo.execute({ path: center.logoPath }) : null;

  return {
    teacherName: request.teacherName,
    generatedOn: request.generatedOn,
    filterSummary: toFilterSummary(request.filters),
    rows: request.rows.map(toPdfRow),
    center: {
      name: center?.name ?? '',
      address: center?.address ?? '',
      phone: center?.phone ?? '',
      email: center?.email ?? '',
      logoBytes,
    },
  };
}
