import type { ParentRepository } from '../ports/parent-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { Student } from '../entities/student';
import type { InvoiceListRow } from '../read-models/invoice-list-row';
import type {
  ParentMonthlyStatementView,
  ParentStatementChild,
} from '../read-models/parent-monthly-statement-view';
import type { ParentId } from '../entities/parent';
import type { CenterCode } from '../value-objects/ids';
import { invoiceTotalMad } from '../policies/invoice-total';
import { paymentStatusOf } from '../policies/payment-status';
import { aggregateParentStatement } from '../policies/parent-statement-aggregation';
import { ParentNotFoundError } from '../errors/people-errors';

export type GetParentMonthlyStatementInput = {
  centerCode: CenterCode;
  parentId: ParentId;
  month: string; // 'YYYY-MM'
};

// The read model behind the consolidated Facture groupée (SOU-284): one document
// over all a guardian's live children in this center — one block per child (each
// carrying that child's own invoice number + derived status), then one grand-total
// block whose status/total follow from the sums across children.
//
// A pure derived read model — no stored parent invoice, no persisted total. It
// reuses the same seams the per-student flow uses (`invoiceTotalMad`,
// `paymentStatusOf`, the `listInvoices` join's SQL-derived totals) rather than
// re-deriving money anywhere. Each child's invoice is fetched targeted by
// `(studentId, month)`; a guardian's child count is small and bounded, so this is
// not the pathological per-row scan of an unbounded set — the whole-center-month
// read would over-fetch to serve one parent.
//
// Gated by `core.invoicing` (+ `core.parents` for the guardian resolution). The
// guardian is resolved center-scoped; an unknown or foreign-center id raises
// ParentNotFoundError. Children are resolved via `listByGuardian`, which is
// center-scoped in the repository read — never a cross-`centreId` leak.
export class GetParentMonthlyStatement {
  constructor(
    private readonly parents: ParentRepository,
    private readonly students: StudentRepository,
    private readonly invoices: InvoiceRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetParentMonthlyStatementInput): Promise<ParentMonthlyStatementView> {
    this.plan.require('core.invoicing');
    this.plan.require('core.parents');

    const parent = await this.parents.findById(input.parentId);
    if (parent === null || parent.centerCode !== input.centerCode) {
      throw new ParentNotFoundError(input.parentId);
    }

    const children = await this.students.listByGuardian(input.centerCode, input.parentId);
    const ordered = [...children].sort((a, b) => a.name.fr.localeCompare(b.name.fr));
    const perChild = await Promise.all(
      ordered.map((child) => this.buildChild(input.centerCode, child, input.month)),
    );

    return {
      parentId: parent.id,
      parentName: parent.name,
      month: input.month,
      perChild,
      ...aggregateParentStatement(perChild),
    };
  }

  private async buildChild(
    centerCode: CenterCode,
    child: Student,
    month: string,
  ): Promise<ParentStatementChild> {
    const page = await this.invoices.listInvoices(centerCode, { studentId: child.id, month });
    const row = page.rows[0];
    return row ? invoicedChild(child, row) : uninvoicedChild(child);
  }
}

function invoicedChild(child: Student, row: InvoiceListRow): ParentStatementChild {
  const regularLines = row.lines.filter((line) => line.kind === 'regular');
  const examPrepLines = row.lines.filter((line) => line.kind === 'exam-prep');
  const childTotalMad = row.totalMad;
  const childNetPaidMad = row.netPaidMad;
  return {
    childId: child.id,
    childName: { fr: child.name.fr, ar: child.name.ar },
    invoiceId: row.invoice.id,
    invoiceStatus: row.invoice.status,
    regularLines,
    examPrepLines,
    regularSubtotalMad: invoiceTotalMad(regularLines),
    examPrepSubtotalMad: invoiceTotalMad(examPrepLines),
    childTotalMad,
    childNetPaidMad,
    childOutstandingMad: Math.max(0, childTotalMad - childNetPaidMad),
    childStatus: paymentStatusOf(childTotalMad, childNetPaidMad),
  };
}

function uninvoicedChild(child: Student): ParentStatementChild {
  return {
    childId: child.id,
    childName: { fr: child.name.fr, ar: child.name.ar },
    invoiceId: null,
    invoiceStatus: null,
    regularLines: [],
    examPrepLines: [],
    regularSubtotalMad: 0,
    examPrepSubtotalMad: 0,
    childTotalMad: 0,
    childNetPaidMad: 0,
    childOutstandingMad: 0,
    childStatus: 'unpaid',
  };
}
