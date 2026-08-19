import { dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type { ParentStatementPdfRenderer, CenterCode, ParentId } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { buildParentStatementPdfInput, type ParentStatementAssemblyDeps } from './parent-statement-pdf-assembly';
import { writeTempPdf } from '../../data/fs/temp-pdf';

export type ParentStatementPdfRendererPort = Pick<ParentStatementPdfRenderer, 'render'>;

/** Only the surface the consolidated-statement print/export channels need. */
export type ParentStatementHandlerDeps = ParentStatementAssemblyDeps & {
  parentStatementPdfRenderer: ParentStatementPdfRendererPort;
  centerCode: () => CenterCode;
  tempDir: string;
};

/**
 * Consolidated per-parent statement print/export IPC handlers (SOU-284) — the
 * "Facture groupée". Mirrors `invoice-handlers.ts`' print/export pair: both render
 * the same `pdf-lib` document from the derived `GetParentMonthlyStatement` read
 * model and only differ in what happens to the bytes — print opens the OS's
 * default PDF viewer, export lets the user pick a save location. `centerCode` is
 * injected in main, never sent from the renderer.
 */
export function createParentStatementHandlers(
  deps: ParentStatementHandlerDeps,
): Pick<IpcHandlers, 'parentStatement.print' | 'parentStatement.export'> {
  return {
    'parentStatement.print': async (request) => {
      const input = await buildParentStatementPdfInput(
        deps,
        deps.centerCode(),
        request.parentId as ParentId,
        request.month,
        request.locale,
      );
      const bytes = await deps.parentStatementPdfRenderer.render(input);
      const tempPath = writeTempPdf(deps.tempDir, 'facture-groupee-', [request.parentId, request.month], bytes);
      await shell.openPath(tempPath);
      return { ok: true };
    },
    'parentStatement.export': async (request) => {
      const win = BrowserWindow.getFocusedWindow();
      const defaultPath = `facture-groupee-${request.month}-${request.parentId}.pdf`;
      const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const input = await buildParentStatementPdfInput(
        deps,
        deps.centerCode(),
        request.parentId as ParentId,
        request.month,
        request.locale,
      );
      const bytes = await deps.parentStatementPdfRenderer.render(input);
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
  };
}
