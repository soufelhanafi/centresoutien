import type { TeacherRosterEntryView, TeacherRosterPdfRequest } from './teacher-roster-view';

/**
 * The seam the teacher-roster UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place. Backs the "Élèves" tab (SOU-299).
 */
export interface TeacherRosterGateway {
  roster(teacherId: string): Promise<readonly TeacherRosterEntryView[]>;
  print(request: TeacherRosterPdfRequest): Promise<{ ok: true }>;
  export(request: TeacherRosterPdfRequest): Promise<{ savedPath: string | null }>;
}

class IpcTeacherRosterGateway implements TeacherRosterGateway {
  async roster(teacherId: string): Promise<readonly TeacherRosterEntryView[]> {
    const { roster } = await window.api.invoke('teacher.roster', { teacherId });
    return roster;
  }

  async print(request: TeacherRosterPdfRequest): Promise<{ ok: true }> {
    return window.api.invoke('teacher.roster.print', request);
  }

  async export(request: TeacherRosterPdfRequest): Promise<{ savedPath: string | null }> {
    return window.api.invoke('teacher.roster.export', request);
  }
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const teacherRosterGateway: TeacherRosterGateway = new IpcTeacherRosterGateway();
