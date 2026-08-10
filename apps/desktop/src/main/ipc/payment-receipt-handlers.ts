import { dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type { GeneratePaymentReceiptPdf, PaymentId, CenterCode } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { writeTempPdf } from './temp-pdf';

export type GeneratePaymentReceiptPdfUseCase = Pick<GeneratePaymentReceiptPdf, 'execute'>;

/** Only the surface the receipt print/export channels need. */
export type PaymentReceiptHandlerDeps = {
  generatePaymentReceiptPdf: GeneratePaymentReceiptPdfUseCase;
  centerCode: () => CenterCode;
};

/**
 * Payment receipt print/export IPC handlers (SOU-101), split out like
 * `payslip-handlers.ts`. Like the payslip pair (and unlike invoice's), there is
 * no separate assembly step here — `GeneratePaymentReceiptPdf` already resolves
 * the payment, its invoice, and the student/center profile itself; this file
 * only plumbs the resulting bytes to disk, the platform-specific part IPC owns.
 */
export function createPaymentReceiptHandlers(
  deps: PaymentReceiptHandlerDeps,
): Pick<IpcHandlers, 'payment.receipt.print' | 'payment.receipt.export'> {
  return {
    'payment.receipt.print': async (request) => {
      const { paymentId, bytes } = await deps.generatePaymentReceiptPdf.execute({
        centerCode: deps.centerCode(),
        paymentId: request.paymentId as PaymentId,
        locale: request.locale,
      });
      const tempPath = writeTempPdf('recu-paiement-', [paymentId], bytes);
      await shell.openPath(tempPath);
      return { ok: true };
    },
    'payment.receipt.export': async (request) => {
      const win = BrowserWindow.getFocusedWindow();
      const defaultPath = `recu-paiement-${request.paymentId}.pdf`;
      const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const { bytes } = await deps.generatePaymentReceiptPdf.execute({
        centerCode: deps.centerCode(),
        paymentId: request.paymentId as PaymentId,
        locale: request.locale,
      });
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
  };
}
