import type { ArrearsGateway } from './arrears-gateway';
import type {
  ArrearsAgingBucket,
  ArrearsAgingSummaryView,
  ArrearsFilters,
  ArrearsParentGroupView,
  ArrearsSummaryView,
  LocalizedName,
  OverdueInvoiceView,
} from './arrears-view';

const UNKNOWN_STUDENT_NAME: LocalizedName = { fr: '—', ar: '—' };

type DomainAgingBucket = '0-30' | '31-60' | '61-90' | '90-plus';

/**
 * The domain's aging policy (`packages/domain/src/policies/invoice-aging.ts`)
 * splits `61+` days into `61-90` / `90-plus` for its own reporting precision;
 * this screen's UI only ever shows the three buckets from the SOU-103
 * acceptance criteria ("30/60/90 days"), so `61-90` and `90-plus` both
 * collapse onto the `90+` badge/summary card.
 */
function toArrearsBucket(bucket: DomainAgingBucket): ArrearsAgingBucket {
  if (bucket === '0-30') return '30';
  if (bucket === '31-60') return '60';
  return '90+';
}

function oldestBucket(invoices: readonly OverdueInvoiceView[]): ArrearsAgingBucket {
  if (invoices.some((invoice) => invoice.agingBucket === '90+')) return '90+';
  if (invoices.some((invoice) => invoice.agingBucket === '60')) return '60';
  return '30';
}

function toAgingSummary(
  agingSummary: readonly { bucket: DomainAgingBucket; outstandingMad: number }[],
  parentsWithGuardian: number,
): ArrearsAgingSummaryView {
  const amountFor = (bucket: DomainAgingBucket): number =>
    agingSummary.find((entry) => entry.bucket === bucket)?.outstandingMad ?? 0;

  const bucket30Mad = amountFor('0-30');
  const bucket60Mad = amountFor('31-60');
  const bucket90PlusMad = amountFor('61-90') + amountFor('90-plus');

  return {
    bucket30Mad,
    bucket60Mad,
    bucket90PlusMad,
    totalOutstandingMad: bucket30Mad + bucket60Mad + bucket90PlusMad,
    parentsCount: parentsWithGuardian,
  };
}

/**
 * The real {@link ArrearsGateway}: maps `invoice.overdue` (SOU-103) onto the
 * screen's view types.
 *
 * `groupId` on `OverdueInvoiceView` was only ever needed for client-side
 * filtering (never rendered — CLAUDE.md §7 forbids showing
 * groups as a billing dimension). The real channel filters `groupId`
 * server-side, so this adapter always sets it to `null`. `parentId` /
 * `parentName` / `parentPhone` are passed through as `null` as-is when a
 * student has no linked guardian — the components render the fallback label,
 * not this gateway (a Presentation concern, not a data-mapping one).
 */
class IpcArrearsGateway implements ArrearsGateway {
  async list(filters: ArrearsFilters): Promise<ArrearsSummaryView> {
    const { groups, agingSummary } = await window.api.invoke('invoice.overdue', {
      ...(filters.month !== undefined && { month: filters.month }),
      ...(filters.minOutstandingMad !== undefined && { minOutstandingMad: filters.minOutstandingMad }),
      ...(filters.maxOutstandingMad !== undefined && { maxOutstandingMad: filters.maxOutstandingMad }),
      ...(filters.groupId !== undefined && { groupId: filters.groupId }),
      ...(filters.status !== undefined && { status: filters.status }),
    });

    const parents: ArrearsParentGroupView[] = groups.map((group) => {
      const invoices: OverdueInvoiceView[] = group.invoices.map((invoice) => ({
        invoiceId: invoice.invoiceId,
        studentId: invoice.studentId,
        studentName: invoice.studentName ?? UNKNOWN_STUDENT_NAME,
        groupId: null,
        month: invoice.month,
        outstandingMad: invoice.outstandingMad,
        monthsOverdue: invoice.monthsOverdue,
        agingBucket: toArrearsBucket(invoice.agingBucket),
        status: invoice.status,
      }));

      return {
        parentId: group.parentId,
        parentName: group.parentName,
        parentPhone: group.parentPhone,
        totalOutstandingMad: group.totalOutstandingMad,
        oldestAgingBucket: oldestBucket(invoices),
        invoices,
      };
    });

    const parentsWithGuardian = parents.filter((parent) => parent.parentId !== null).length;
    return { parents, aging: toAgingSummary(agingSummary, parentsWithGuardian) };
  }
}

export const ipcArrearsGateway: ArrearsGateway = new IpcArrearsGateway();
