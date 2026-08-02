import { app, dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GeneratePayslipPdf, TeacherPayoutId, CenterCode } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

export type GeneratePayslipPdfUseCase = Pick<GeneratePayslipPdf, 'execute'>;

/** Only the surface the payslip print/export channels need. */
export type PayslipHandlerDeps = {
  generatePayslipPdf: GeneratePayslipPdfUseCase;
  centerCode: () => CenterCode;
};

/**
 * Payslip print/export IPC handlers (SOU-75), split out like
 * `invoice-handlers.ts`. Unlike the invoice pair, there is no separate
 * assembly step here — `GeneratePayslipPdf` already resolves the payout,
 * teacher, and center profile itself; this file only plumbs the resulting
 * bytes to disk, the platform-specific part IPC owns.
 */
export function createPayslipHandlers(
  deps: PayslipHandlerDeps,
): Pick<IpcHandlers, 'payslip.print' | 'payslip.export'> {
  return {
    'payslip.print': async (request) => {
      const bytes = await deps.generatePayslipPdf.execute({
        centerCode: deps.centerCode(),
        teacherPayoutId: request.teacherPayoutId as TeacherPayoutId,
        locale: request.locale,
      });
      const tempPath = join(app.getPath('temp'), `bulletin-paie-${request.teacherPayoutId}-${Date.now()}.pdf`);
      writeFileSync(tempPath, bytes);
      await shell.openPath(tempPath);
      return { ok: true };
    },
    'payslip.export': async (request) => {
      const win = BrowserWindow.getFocusedWindow();
      const defaultPath = `bulletin-paie-${request.teacherPayoutId}.pdf`;
      const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const bytes = await deps.generatePayslipPdf.execute({
        centerCode: deps.centerCode(),
        teacherPayoutId: request.teacherPayoutId as TeacherPayoutId,
        locale: request.locale,
      });
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
  };
}
