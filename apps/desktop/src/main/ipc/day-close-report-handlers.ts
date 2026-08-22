import { dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type {
  GetDayCloseReport,
  DayCloseReportPdfRenderer,
  DayCloseReportPdfInput,
  DayCloseReport,
  GetCenterProfile,
  ReadCenterLogo,
  CenterCode,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { writeTempPdf } from '../../data/fs/temp-pdf';

/** Project the read model to the IPC boundary DTO: `readonly` arrays widened to
 *  plain arrays, like every other view in `handlers.ts` — the shape is otherwise
 *  unchanged (the report is already the boundary shape). */
function toDayCloseReportView(report: DayCloseReport) {
  return {
    day: report.day,
    newSubscriptions: { ...report.newSubscriptions },
    studentsEnrolled: report.studentsEnrolled,
    invoicesGenerated: { ...report.invoicesGenerated },
    totalCollectedMad: report.totalCollectedMad,
    collectedByMethod: { ...report.collectedByMethod },
    encaissements: report.encaissements.map((row) => ({ ...row })),
  };
}

export type GetDayCloseReportUseCase = Pick<GetDayCloseReport, 'execute'>;
export type DayCloseReportPdfRendererPort = Pick<DayCloseReportPdfRenderer, 'render'>;

/** Only the surface the day-close get/print/export channels need. */
export type DayCloseReportHandlerDeps = {
  getDayCloseReport: GetDayCloseReportUseCase;
  dayCloseReportPdfRenderer: DayCloseReportPdfRendererPort;
  getCenterProfile: Pick<GetCenterProfile, 'execute'>;
  readCenterLogo: Pick<ReadCenterLogo, 'execute'>;
  centerCode: () => CenterCode;
  now: () => Date;
  tempDir: string;
};

async function buildDayClosePdfInput(
  deps: DayCloseReportHandlerDeps,
  report: DayCloseReport,
): Promise<DayCloseReportPdfInput> {
  const center = await deps.getCenterProfile.execute();
  const logoBytes = center?.logoPath ? await deps.readCenterLogo.execute({ path: center.logoPath }) : null;
  return {
    report,
    generatedAt: deps.now(),
    center: {
      name: center?.name ?? '',
      address: center?.address ?? '',
      phone: center?.phone ?? '',
      email: center?.email ?? '',
      logoBytes,
    },
  };
}

/**
 * End-of-day "Clôture du jour" report IPC handlers (SOU-300), split out of
 * `handlers.ts` like `invoice-handlers.ts`. `get` returns the composed report view;
 * `print`/`export` both render the same FR-only `pdf-lib` document (never
 * `printToPDF`) and differ only in what happens to the bytes — print opens the OS's
 * default PDF viewer, export lets the user pick a save location. The report DTO
 * mirrors the domain {@link DayCloseReport} field-for-field, so `get` returns it as-is.
 */
export function createDayCloseReportHandlers(
  deps: DayCloseReportHandlerDeps,
): Pick<IpcHandlers, 'dayCloseReport.get' | 'dayCloseReport.print' | 'dayCloseReport.export'> {
  return {
    'dayCloseReport.get': async (request) => {
      const report = await deps.getDayCloseReport.execute({
        centerCode: deps.centerCode(),
        day: request.day,
      });
      return toDayCloseReportView(report);
    },
    'dayCloseReport.print': async (request) => {
      const report = await deps.getDayCloseReport.execute({
        centerCode: deps.centerCode(),
        day: request.day,
      });
      const bytes = await deps.dayCloseReportPdfRenderer.render(await buildDayClosePdfInput(deps, report));
      const tempPath = writeTempPdf(deps.tempDir, 'cloture-du-jour-', [request.day], bytes);
      // `shell.openPath` resolves to '' on success and an error string on failure;
      // surface the failure so the renderer's print-error toast fires instead of a
      // silent "ok" with no viewer open.
      const openError = await shell.openPath(tempPath);
      if (openError !== '') throw new Error(`Failed to open the day-close PDF: ${openError}`);
      return { ok: true };
    },
    'dayCloseReport.export': async (request) => {
      const win = BrowserWindow.getFocusedWindow();
      const options = {
        defaultPath: `cloture-du-jour-${request.day}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const report = await deps.getDayCloseReport.execute({
        centerCode: deps.centerCode(),
        day: request.day,
      });
      const bytes = await deps.dayCloseReportPdfRenderer.render(await buildDayClosePdfInput(deps, report));
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
  };
}
