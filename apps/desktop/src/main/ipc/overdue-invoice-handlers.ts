import type {
  ListOverdueInvoices,
  OverdueInvoiceEntry,
  OverdueParentGroup,
  AgingSummaryEntry,
  CenterCode,
  GroupId,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

export type ListOverdueInvoicesUseCase = Pick<ListOverdueInvoices, 'execute'>;

/** Only the surface the Impayés (arrears) read channel needs. */
export type OverdueInvoiceHandlerDeps = {
  listOverdueInvoices: ListOverdueInvoicesUseCase;
  centerCode: () => CenterCode;
};

/** Project one overdue invoice entry to the IPC boundary DTO — the shape is
 *  otherwise unchanged, mirroring `toInvoiceListItemView` in `invoice-handlers.ts`. */
function toOverdueInvoiceEntryView(entry: OverdueInvoiceEntry) {
  return {
    invoiceId: entry.invoiceId,
    studentId: entry.studentId,
    studentName: entry.studentName ? { fr: entry.studentName.fr, ar: entry.studentName.ar } : null,
    month: entry.month,
    outstandingMad: entry.outstandingMad,
    daysOverdue: entry.daysOverdue,
    monthsOverdue: entry.monthsOverdue,
    agingBucket: entry.agingBucket,
    status: entry.status,
  };
}

function toOverdueParentGroupView(group: OverdueParentGroup) {
  return {
    parentId: group.parentId,
    parentName: group.parentName,
    parentPhone: group.parentPhone,
    totalOutstandingMad: group.totalOutstandingMad,
    invoices: group.invoices.map(toOverdueInvoiceEntryView),
  };
}

function toAgingSummaryEntryView(entry: AgingSummaryEntry) {
  return { bucket: entry.bucket, count: entry.count, outstandingMad: entry.outstandingMad };
}

/**
 * Impayés (arrears) read IPC handler (SOU-103), split out like
 * `dashboard-handlers.ts` / `invoice-handlers.ts`. A single delegation to the
 * pre-wired `ListOverdueInvoices` use case — filtering, grouping-by-guardian,
 * and the aging summary all live in the domain; this file only projects the
 * result to the IPC boundary DTO and widens the optional string filters.
 */
export function createOverdueInvoiceHandlers(
  deps: OverdueInvoiceHandlerDeps,
): Pick<IpcHandlers, 'invoice.overdue'> {
  return {
    'invoice.overdue': async (request) => {
      const result = await deps.listOverdueInvoices.execute({
        centerCode: deps.centerCode(),
        ...(request.month !== undefined && { month: request.month }),
        ...(request.minOutstandingMad !== undefined && {
          minOutstandingMad: request.minOutstandingMad,
        }),
        ...(request.maxOutstandingMad !== undefined && {
          maxOutstandingMad: request.maxOutstandingMad,
        }),
        ...(request.groupId !== undefined && { groupId: request.groupId as GroupId }),
        ...(request.status !== undefined && { status: request.status }),
      });
      return {
        groups: result.groups.map(toOverdueParentGroupView),
        agingSummary: result.agingSummary.map(toAgingSummaryEntryView),
      };
    },
  };
}
