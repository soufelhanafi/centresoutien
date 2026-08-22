import type { IpcRequest, TeacherRosterEntryDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of one teacher-roster row (SOU-299) — a direct alias of
 * the boundary's `teacherRosterEntrySchema`, the single source of truth in
 * `shared/ipc/contract`, so the renderer shape can never drift from the wire.
 */
export type TeacherRosterEntryView = TeacherRosterEntryDto;

/** The status filter shown in the "Élèves" tab. */
export type TeacherRosterStatusFilter = 'all' | 'active' | 'left';

/** The composable filter selection over a teacher's roster (AND semantics). */
export type TeacherRosterFilter = {
  subjectId: string | null;
  groupId: string | null;
  nameQuery: string;
  status: TeacherRosterStatusFilter;
};

export const EMPTY_TEACHER_ROSTER_FILTER: TeacherRosterFilter = {
  subjectId: null,
  groupId: null,
  nameQuery: '',
  status: 'active',
};

/** The print/export request payload — the rows the tab currently displays plus the
 *  active-filter context, so the printout is exactly the on-screen view. */
export type TeacherRosterPdfRequest = IpcRequest<'teacher.roster.export'>;
