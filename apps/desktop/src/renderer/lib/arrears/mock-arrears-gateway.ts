import type { ArrearsGateway } from './arrears-gateway';
import type {
  ArrearsAgingBucket,
  ArrearsAgingSummaryView,
  ArrearsFilters,
  ArrearsParentGroupView,
  ArrearsSummaryView,
  OverdueInvoiceView,
} from './arrears-view';
import { ARREARS_PARENT_SEED } from './mock-arrears-seed';

function matchesInvoice(invoice: OverdueInvoiceView, filters: ArrearsFilters): boolean {
  if (filters.month !== undefined && invoice.month !== filters.month) return false;
  if (filters.status !== undefined && invoice.status !== filters.status) return false;
  if (filters.groupId !== undefined && invoice.groupId !== filters.groupId) return false;
  return true;
}

function oldestBucket(invoices: readonly OverdueInvoiceView[]): ArrearsAgingBucket {
  if (invoices.some((invoice) => invoice.agingBucket === '90+')) return '90+';
  if (invoices.some((invoice) => invoice.agingBucket === '60')) return '60';
  return '30';
}

function summarizeAging(parents: readonly ArrearsParentGroupView[]): ArrearsAgingSummaryView {
  const summary = { bucket30Mad: 0, bucket60Mad: 0, bucket90PlusMad: 0 };
  for (const parent of parents) {
    for (const invoice of parent.invoices) {
      if (invoice.agingBucket === '30') summary.bucket30Mad += invoice.outstandingMad;
      else if (invoice.agingBucket === '60') summary.bucket60Mad += invoice.outstandingMad;
      else summary.bucket90PlusMad += invoice.outstandingMad;
    }
  }
  return {
    ...summary,
    totalOutstandingMad: summary.bucket30Mad + summary.bucket60Mad + summary.bucket90PlusMad,
    parentsCount: parents.length,
  };
}

/**
 * In-memory stand-in for the not-yet-published `arrears.list` channel (see
 * `arrears-gateway.ts`). Filters invoices first (month / status / group),
 * recomputes each parent's total from the surviving invoices, then applies
 * the amount range on that recomputed total — mirroring how the real read
 * model is expected to combine these filters server-side.
 */
export class MockArrearsGateway implements ArrearsGateway {
  async list(filters: ArrearsFilters): Promise<ArrearsSummaryView> {
    const parents: ArrearsParentGroupView[] = [];

    for (const parent of ARREARS_PARENT_SEED) {
      const invoices = parent.invoices.filter((invoice) => matchesInvoice(invoice, filters));
      if (invoices.length === 0) continue;

      const totalOutstandingMad = invoices.reduce((sum, invoice) => sum + invoice.outstandingMad, 0);
      if (filters.minOutstandingMad !== undefined && totalOutstandingMad < filters.minOutstandingMad) continue;
      if (filters.maxOutstandingMad !== undefined && totalOutstandingMad > filters.maxOutstandingMad) continue;

      parents.push({
        parentId: parent.parentId,
        parentName: parent.parentName,
        parentPhone: parent.parentPhone,
        totalOutstandingMad,
        oldestAgingBucket: oldestBucket(invoices),
        invoices,
      });
    }

    parents.sort((a, b) => b.totalOutstandingMad - a.totalOutstandingMad);

    return { parents, aging: summarizeAging(parents) };
  }
}

export const mockArrearsGateway = new MockArrearsGateway();
