import { dialog, shell, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type {
  ListInvoices,
  IssueInvoice,
  CancelInvoice,
  UpdateDraftInvoiceLineAmount,
  SetInvoiceSubjectAllocation,
  InvoicePdfRenderer,
  InvoiceListItem,
  InvoiceLine,
  Invoice,
  InvoiceSubjectAllocation,
  CenterCode,
  StudentId,
  InvoiceId,
  SubjectId,
  UserId,
} from '@centresoutien/domain';
import { InvoiceNotFoundError } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { buildInvoicePdfInput, type PdfAssemblyDeps } from './invoice-pdf-assembly';
import { writeTempPdf } from '../../data/fs/temp-pdf';

export type ListInvoicesUseCase = Pick<ListInvoices, 'execute'>;
export type IssueInvoiceUseCase = Pick<IssueInvoice, 'execute'>;
export type CancelInvoiceUseCase = Pick<CancelInvoice, 'execute'>;
export type UpdateDraftInvoiceLineAmountUseCase = Pick<UpdateDraftInvoiceLineAmount, 'execute'>;
export type SetInvoiceSubjectAllocationUseCase = Pick<SetInvoiceSubjectAllocation, 'execute'>;
export type InvoicePdfRendererPort = Pick<InvoicePdfRenderer, 'render'>;

/** Only the surface the invoice list/print/export/issue/cancel/line-edit/allocation channels need. */
export type InvoiceHandlerDeps = PdfAssemblyDeps & {
  listInvoices: ListInvoicesUseCase;
  issueInvoice: IssueInvoiceUseCase;
  cancelInvoice: CancelInvoiceUseCase;
  updateDraftInvoiceLineAmount: UpdateDraftInvoiceLineAmountUseCase;
  setInvoiceSubjectAllocation: SetInvoiceSubjectAllocationUseCase;
  invoicePdfRenderer: InvoicePdfRendererPort;
  centerCode: () => CenterCode;
  updatedBy: () => UserId;
  tempDir: string;
};

function toSubjectAllocationView(allocation: readonly InvoiceSubjectAllocation[] | null) {
  if (allocation === null) return null;
  return allocation.map((entry) => ({ subjectId: entry.subjectId, amountMad: entry.amountMad }));
}

function toInvoiceLineView(line: InvoiceLine) {
  return {
    id: line.id,
    formulaId: line.formulaId,
    label: { fr: line.label.fr, ar: line.label.ar },
    kind: line.kind,
    amountMad: line.amountMad,
  };
}

/** Project a list/detail read-model row to its IPC boundary DTO: envelope
 *  stripped, dates serialized, like every other view in `handlers.ts`. */
function toInvoiceListItemView(item: InvoiceListItem) {
  return {
    id: item.invoice.id,
    studentId: item.invoice.studentId,
    studentName: { fr: item.studentName.fr, ar: item.studentName.ar },
    month: item.invoice.month,
    status: item.invoice.status,
    issuedAt: item.invoice.issuedAt ? item.invoice.issuedAt.toISOString() : null,
    lines: item.lines.map(toInvoiceLineView),
    totalMad: item.totalMad,
    netPaidMad: item.netPaidMad,
    outstandingMad: item.outstandingMad,
    paymentStatus: item.status,
  };
}

/** Project an issued/cancelled invoice header to the transition result DTO
 *  (SOU-143) — dates serialized like every other view in this file. */
function toInvoiceTransitionView(invoice: Invoice) {
  return {
    id: invoice.id,
    status: invoice.status,
    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    cancelledAt: invoice.cancelledAt ? invoice.cancelledAt.toISOString() : null,
  };
}

/** Resolves the single invoice `invoiceId` names to its full list/detail read
 *  row, or throws {@link InvoiceNotFoundError} for an unknown/foreign-center id —
 *  the same resolution `payment.summary` already performs via a different port. */
async function findInvoiceOrThrow(
  deps: InvoiceHandlerDeps,
  invoiceId: string,
): Promise<InvoiceListItem> {
  const { items } = await deps.listInvoices.execute({
    centerCode: deps.centerCode(),
    invoiceId: invoiceId as InvoiceId,
  });
  const [item] = items;
  if (!item) throw new InvoiceNotFoundError(invoiceId as InvoiceId);
  return item;
}

/**
 * Invoice list/detail/print/export IPC handlers (SOU-69), split out of
 * `handlers.ts` like `backup-handlers.ts`. `print`/`export` both render the
 * same `pdf-lib` document (KICKOFF: never `printToPDF`) and only differ in
 * what happens to the bytes afterwards — print opens the OS's default PDF
 * viewer (where the user drives the native print dialog themselves; Electron
 * has no API to hand raw bytes straight to a print dialog), export lets the
 * user pick a save location.
 */
export function createInvoiceHandlers(
  deps: InvoiceHandlerDeps,
): Pick<
  IpcHandlers,
  | 'invoice.list'
  | 'invoice.print'
  | 'invoice.export'
  | 'invoice.issue'
  | 'invoice.cancel'
  | 'invoice.updateLineAmount'
  | 'invoice.setAllocation'
> {
  return {
    'invoice.list': async (request) => {
      const { items, nextCursor } = await deps.listInvoices.execute({
        centerCode: deps.centerCode(),
        ...(request.month !== undefined && { month: request.month }),
        ...(request.studentId !== undefined && { studentId: request.studentId as StudentId }),
        ...(request.invoiceId !== undefined && { invoiceId: request.invoiceId as InvoiceId }),
        ...(request.paymentStatus !== undefined && { paymentStatus: request.paymentStatus }),
        ...(request.openOnly !== undefined && { openOnly: request.openOnly }),
        ...(request.search !== undefined && { search: request.search }),
        ...(request.cursor !== undefined && { cursor: request.cursor }),
        ...(request.pageSize !== undefined && { pageSize: request.pageSize }),
      });
      return { invoices: items.map(toInvoiceListItemView), nextCursor };
    },
    'invoice.print': async (request) => {
      const item = await findInvoiceOrThrow(deps, request.invoiceId);
      const pdfInput = await buildInvoicePdfInput(deps, deps.centerCode(), item, request.locale);
      const bytes = await deps.invoicePdfRenderer.render(pdfInput);
      const tempPath = writeTempPdf(deps.tempDir, 'facture-', [item.invoice.id], bytes);
      await shell.openPath(tempPath);
      return { ok: true };
    },
    'invoice.export': async (request) => {
      const item = await findInvoiceOrThrow(deps, request.invoiceId);
      const win = BrowserWindow.getFocusedWindow();
      const defaultPath = `facture-${item.invoice.month}-${item.invoice.id}.pdf`;
      const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { savedPath: null };
      const pdfInput = await buildInvoicePdfInput(deps, deps.centerCode(), item, request.locale);
      const bytes = await deps.invoicePdfRenderer.render(pdfInput);
      writeFileSync(result.filePath, bytes);
      return { savedPath: result.filePath };
    },
    'invoice.issue': async (request) => {
      const invoice = await deps.issueInvoice.execute({
        centerCode: deps.centerCode(),
        invoiceId: request.invoiceId as InvoiceId,
        updatedBy: deps.updatedBy(),
      });
      return toInvoiceTransitionView(invoice);
    },
    'invoice.cancel': async (request) => {
      const invoice = await deps.cancelInvoice.execute({
        centerCode: deps.centerCode(),
        invoiceId: request.invoiceId as InvoiceId,
        updatedBy: deps.updatedBy(),
      });
      return toInvoiceTransitionView(invoice);
    },
    'invoice.updateLineAmount': async (request) => {
      const line = await deps.updateDraftInvoiceLineAmount.execute({
        centerCode: deps.centerCode(),
        invoiceId: request.invoiceId,
        lineId: request.lineId,
        amountMad: request.amountMad,
        updatedBy: deps.updatedBy(),
      });
      return { line: toInvoiceLineView(line) };
    },
    'invoice.setAllocation': async (request) => {
      const invoice = await deps.setInvoiceSubjectAllocation.execute({
        centerCode: deps.centerCode(),
        invoiceId: request.invoiceId as InvoiceId,
        allocations:
          request.allocations === null
            ? null
            : request.allocations.map((entry) => ({
                subjectId: entry.subjectId as SubjectId,
                amountMad: entry.amountMad,
              })),
        updatedBy: deps.updatedBy(),
      });
      return { subjectAllocation: toSubjectAllocationView(invoice.subjectAllocation) };
    },
  };
}
