import { dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type { CenterCode, ListWeekSessions } from '@centresoutien/domain';
import type { PdfLibScheduleRenderer } from '../../data/pdf/pdf-lib-schedule-renderer';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { buildSchedulePdfInput, type ScheduleAssemblyDeps } from './schedule-pdf-assembly';
import { writeTempPdf } from '../../data/fs/temp-pdf';

export type ListWeekSessionsUseCase = Pick<ListWeekSessions, 'execute'>;
export type SchedulePdfRenderer = Pick<PdfLibScheduleRenderer, 'render'>;

/** Only the surface the schedule print/export channels need. */
export type ScheduleHandlerDeps = ScheduleAssemblyDeps & {
  listWeekSessions: ListWeekSessionsUseCase;
  scheduleRenderer: SchedulePdfRenderer;
  centerCode: () => CenterCode;
};

/**
 * Weekly schedule print/export IPC handlers (SOU-107), split out like
 * `payslip-handlers.ts`. No domain use case sits between `ListWeekSessions` and
 * the renderer — `ListWeekSessions` already returns the full week, so this file
 * only filters it to the requested view (`buildSchedulePdfInput`) and plumbs
 * the resulting bytes to disk, the platform-specific part IPC owns. `print`/
 * `export` both render the same document and only differ in what happens to
 * the bytes afterwards, mirroring the invoice/payslip pair.
 */
export function createScheduleHandlers(
  deps: ScheduleHandlerDeps,
): Pick<IpcHandlers, 'schedule.print' | 'schedule.export'> {
  return {
    'schedule.print': async (request) => {
      const sessions = await deps.listWeekSessions.execute({ centerCode: deps.centerCode() });
      const pdfInput = await buildSchedulePdfInput(deps, sessions, request.view, request.locale);
      const bytes = await deps.scheduleRenderer.render(pdfInput);
      const tempPath = writeTempPdf('planning-', [request.view.scope], bytes);
      await shell.openPath(tempPath);
      return { ok: true };
    },
    'schedule.export': async (request) => {
      const win = BrowserWindow.getFocusedWindow();
      const defaultPath = `planning-${request.view.scope}.pdf`;
      const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const sessions = await deps.listWeekSessions.execute({ centerCode: deps.centerCode() });
      const pdfInput = await buildSchedulePdfInput(deps, sessions, request.view, request.locale);
      const bytes = await deps.scheduleRenderer.render(pdfInput);
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
  };
}
