import { dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type {
  GetMultiCenterStats,
  MultiCenterStatsPdfRenderer,
  MultiCenterStatsPdfInput,
  MultiCenterStatsView,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { writeTempPdf } from '../../data/fs/temp-pdf';

export type GetMultiCenterStatsUseCase = Pick<GetMultiCenterStats, 'execute'>;
export type MultiCenterStatsPdfRendererPort = Pick<MultiCenterStatsPdfRenderer, 'render'>;

/** Only the surface the per-center stats channels need. */
export type MultiCenterStatsHandlerDeps = {
  getMultiCenterStats: GetMultiCenterStatsUseCase;
  multiCenterStatsPdfRenderer: MultiCenterStatsPdfRendererPort;
  tempDir: string;
};

/** Project the derived view to the PDF port input — drops the internal `centreId`
 *  and adds the requested locale; every figure is already domain-derived. */
function toPdfInput(view: MultiCenterStatsView, locale: 'fr' | 'ar'): MultiCenterStatsPdfInput {
  return {
    locale,
    month: view.month,
    rows: view.rows.map((row) => ({
      centerCode: row.centerCode,
      displayName: row.displayName,
      revenueMad: row.revenueMad,
      collectedMad: row.collectedMad,
      studentCount: row.studentCount,
      unpaidRate: row.unpaidRate,
      momGrowthPercent: row.momGrowthPercent,
      unavailable: row.unavailable,
    })),
    totals: { ...view.totals },
  };
}

/**
 * Per-center stats IPC handlers (SOU-106) — the Premium `org.multi-center` table
 * plus its FR/AR PDF export, split out like `dashboard-handlers.ts` /
 * `parent-statement-handlers.ts`. `get` is a plain read delegating to the
 * plan-gated use case (a non-Premium plan's `PlanFeatureUnavailableError` is
 * mapped by the shared dispatcher). `print`/`export` re-run the same read for the
 * current reporting month and render it — `print` opens the OS viewer, `export`
 * writes to a user-chosen path.
 */
export function createMultiCenterStatsHandlers(
  deps: MultiCenterStatsHandlerDeps,
): Pick<IpcHandlers, 'multiCenterStats.get' | 'multiCenterStats.print' | 'multiCenterStats.export'> {
  return {
    'multiCenterStats.get': async () => {
      const view = await deps.getMultiCenterStats.execute();
      return { view: { ...view, rows: view.rows.map((row) => ({ ...row })), totals: { ...view.totals } } };
    },
    'multiCenterStats.print': async (request) => {
      const view = await deps.getMultiCenterStats.execute();
      const bytes = await deps.multiCenterStatsPdfRenderer.render(toPdfInput(view, request.locale));
      const tempPath = writeTempPdf(deps.tempDir, 'stats-centres-', [view.month], bytes);
      const openError = await shell.openPath(tempPath);
      if (openError !== '') throw new Error(`Failed to open the stats PDF: ${openError}`);
      return { ok: true };
    },
    'multiCenterStats.export': async (request) => {
      const view = await deps.getMultiCenterStats.execute();
      const win = BrowserWindow.getFocusedWindow();
      const options = {
        defaultPath: `stats-centres-${view.month}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      };
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const bytes = await deps.multiCenterStatsPdfRenderer.render(toPdfInput(view, request.locale));
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
  };
}
