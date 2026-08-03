import type { OverdueInvoiceViewReadPort } from '../ports/overdue-invoice-view-read-port';
import type { OverdueInvoiceLineView } from '../read-models/overdue-invoice-view';
import type { ParentRepository } from '../ports/parent-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { InvoiceId } from '../entities/invoice';
import type { StudentId } from '../entities/student';
import type { ParentId } from '../entities/parent';
import type { GroupId } from '../entities/group';
import type { PhoneNumber } from '../value-objects/phone-number';
import type { CenterCode } from '../value-objects/ids';
import { paymentStatusOf } from '../policies/payment-status';
import {
  agingBucketFor,
  daysOverdue,
  invoiceDueDate,
  monthsOverdue,
  AGING_BUCKETS,
  type AgingBucket,
} from '../policies/invoice-aging';

/** The only two derived payment statuses that ever reach the arrears list — a
 *  `paid` invoice is never overdue by definition. */
export type OverdueStatusFilter = 'unpaid' | 'partially-paid';

export type ListOverdueInvoicesInput = {
  centerCode: CenterCode;
  month?: string;
  minOutstandingMad?: number;
  maxOutstandingMad?: number;
  groupId?: GroupId;
  status?: OverdueStatusFilter;
};

export type OverdueInvoiceEntry = {
  readonly invoiceId: InvoiceId;
  readonly studentId: StudentId;
  readonly studentName: { fr: string; ar: string } | null;
  readonly month: string;
  readonly outstandingMad: number;
  readonly daysOverdue: number;
  readonly monthsOverdue: number;
  readonly agingBucket: AgingBucket;
  readonly status: OverdueStatusFilter;
};

export type OverdueParentGroup = {
  /** `null` when the student has no linked guardian yet — the debt still
   *  surfaces (in its own group) rather than being silently dropped. */
  readonly parentId: ParentId | null;
  readonly parentName: string | null;
  readonly parentPhone: PhoneNumber | null;
  readonly totalOutstandingMad: number;
  readonly invoices: readonly OverdueInvoiceEntry[];
};

export type AgingSummaryEntry = {
  readonly bucket: AgingBucket;
  readonly count: number;
  readonly outstandingMad: number;
};

export type ListOverdueInvoicesResult = {
  readonly groups: readonly OverdueParentGroup[];
  readonly agingSummary: readonly AgingSummaryEntry[];
};

const UNLINKED_GROUP_KEY = '__unlinked__';

/**
 * The Impayés (arrears) read model (SOU-103): every `issued` invoice that is
 * both past its implicit due date (`invoiceDueDate`) and not fully paid,
 * grouped by guardian for phone follow-up rounds, plus a 30/60/90-day aging
 * summary. Derived exclusively from the invoice + payment + student read
 * surface — there is no separate "arrears" state to drift out of sync with
 * the ledger.
 *
 * A student with two linked guardians appears once under EACH guardian (both
 * parents legitimately get called); the aging summary is computed from the
 * deduplicated invoice set first so a shared debt is never double-counted
 * across guardians. A student with no linked guardian yet still surfaces its
 * debt under a `parentId: null` group instead of being dropped.
 *
 * Gated by `core.invoicing` (every plan) — same gate as `ListInvoices` and
 * `GetInvoicePaymentSummary`; arrears is a view over the same billing data,
 * not a separate feature.
 */
export class ListOverdueInvoices {
  constructor(
    private readonly overdueInvoices: OverdueInvoiceViewReadPort,
    private readonly parents: ParentRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListOverdueInvoicesInput): Promise<ListOverdueInvoicesResult> {
    this.plan.require('core.invoicing');

    const today = this.clock.now().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);

    const rows = await this.overdueInvoices.listIssuedInvoiceLines(input.centerCode);
    const entries = this.toOverdueEntries(rows, input, today, currentMonth);

    const agingSummary = this.summarizeAging(entries);
    const groups = await this.groupByParent(entries);

    return { groups, agingSummary };
  }

  private toOverdueEntries(
    rows: readonly OverdueInvoiceLineView[],
    input: ListOverdueInvoicesInput,
    today: string,
    currentMonth: string,
  ): readonly (OverdueInvoiceEntry & { guardianIds: readonly ParentId[] })[] {
    const entries: (OverdueInvoiceEntry & { guardianIds: readonly ParentId[] })[] = [];

    for (const row of rows) {
      if (input.month !== undefined && row.month !== input.month) continue;
      if (input.groupId !== undefined && !row.groupIds.includes(input.groupId)) continue;

      const status = paymentStatusOf(row.totalMad, row.netPaidMad);
      if (status === 'paid') continue;

      const overdueDays = daysOverdue(invoiceDueDate(row.month), today);
      if (overdueDays <= 0) continue;

      const outstandingMad = Math.max(0, row.totalMad - row.netPaidMad);
      if (input.minOutstandingMad !== undefined && outstandingMad < input.minOutstandingMad) continue;
      if (input.maxOutstandingMad !== undefined && outstandingMad > input.maxOutstandingMad) continue;
      if (input.status !== undefined && status !== input.status) continue;

      entries.push({
        invoiceId: row.invoiceId,
        studentId: row.studentId,
        studentName: row.studentName,
        month: row.month,
        outstandingMad,
        daysOverdue: overdueDays,
        monthsOverdue: monthsOverdue(row.month, currentMonth),
        agingBucket: agingBucketFor(overdueDays),
        status,
        guardianIds: row.guardianIds,
      });
    }

    return entries;
  }

  private summarizeAging(
    entries: readonly OverdueInvoiceEntry[],
  ): readonly AgingSummaryEntry[] {
    return AGING_BUCKETS.map((bucket) => {
      const inBucket = entries.filter((entry) => entry.agingBucket === bucket);
      return {
        bucket,
        count: inBucket.length,
        outstandingMad: inBucket.reduce((sum, entry) => sum + entry.outstandingMad, 0),
      };
    });
  }

  private async groupByParent(
    entries: readonly (OverdueInvoiceEntry & { guardianIds: readonly ParentId[] })[],
  ): Promise<readonly OverdueParentGroup[]> {
    const uniqueParentIds = Array.from(new Set(entries.flatMap((entry) => entry.guardianIds)));
    const resolvedParents = await Promise.all(uniqueParentIds.map((id) => this.parents.findById(id)));
    const parentById = new Map(
      resolvedParents
        .filter((parent): parent is NonNullable<typeof parent> => parent !== null)
        .map((parent) => [parent.id, parent] as const),
    );

    const groups = new Map<string, OverdueParentGroup>();
    const addEntry = (parentId: ParentId | null, entry: OverdueInvoiceEntry) => {
      const key = parentId ?? UNLINKED_GROUP_KEY;
      const parent = parentId !== null ? (parentById.get(parentId) ?? null) : null;
      const existing = groups.get(key);
      if (existing) {
        groups.set(key, {
          ...existing,
          totalOutstandingMad: existing.totalOutstandingMad + entry.outstandingMad,
          invoices: [...existing.invoices, entry],
        });
        return;
      }
      groups.set(key, {
        parentId,
        parentName: parent ? parent.name : null,
        parentPhone: parent ? parent.phone : null,
        totalOutstandingMad: entry.outstandingMad,
        invoices: [entry],
      });
    };

    for (const entry of entries) {
      const { guardianIds, ...bare } = entry;
      if (guardianIds.length === 0) {
        addEntry(null, bare);
      } else {
        for (const guardianId of guardianIds) addEntry(guardianId, bare);
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.totalOutstandingMad - a.totalOutstandingMad,
    );
  }
}
