import { dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type { TeacherRosterPdfRenderer } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { buildTeacherRosterPdfInput, type TeacherRosterAssemblyDeps } from './teacher-roster-pdf-assembly';
import { writeTempPdf } from '../../data/fs/temp-pdf';

export type TeacherRosterPdfRendererPort = Pick<TeacherRosterPdfRenderer, 'render'>;

/** Only the surface the teacher-roster print/export channels need. */
export type TeacherRosterHandlerDeps = TeacherRosterAssemblyDeps & {
  teacherRosterPdfRenderer: TeacherRosterPdfRendererPort;
  tempDir: string;
};

/**
 * Teacher-roster print/export IPC handlers (SOU-299) — the "Élèves" tab's PDF
 * output. Mirrors `parent-statement-handlers.ts`: both render the same `pdf-lib`
 * document from the request the renderer sends and differ only in what happens to
 * the bytes — print opens the OS's default PDF viewer, export lets the user pick a
 * save location. The renderer passes the rows it is currently displaying, so the
 * printout is exactly the on-screen filtered view.
 */
export function createTeacherRosterHandlers(
  deps: TeacherRosterHandlerDeps,
): Pick<IpcHandlers, 'teacher.roster.print' | 'teacher.roster.export'> {
  return {
    'teacher.roster.print': async (request) => {
      const input = await buildTeacherRosterPdfInput(deps, request);
      const bytes = await deps.teacherRosterPdfRenderer.render(input);
      // The teacher id is renderer-supplied; strip anything that isn't a safe
      // file-name char so it can never escape the temp dir (defense in depth).
      const safeId = request.teacherId.replace(/[^A-Za-z0-9_-]/g, '');
      const tempPath = writeTempPdf(deps.tempDir, 'eleves-', [safeId], bytes);
      const openError = await shell.openPath(tempPath);
      if (openError !== '') throw new Error(`Failed to open the roster PDF: ${openError}`);
      return { ok: true };
    },
    'teacher.roster.export': async (request) => {
      const win = BrowserWindow.getFocusedWindow();
      const defaultPath = `eleves-${request.teacherName}.pdf`.replace(/[/\\]/g, '-');
      const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const input = await buildTeacherRosterPdfInput(deps, request);
      const bytes = await deps.teacherRosterPdfRenderer.render(input);
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
  };
}
