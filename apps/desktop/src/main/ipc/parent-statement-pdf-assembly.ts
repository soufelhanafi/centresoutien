import type {
  GetParentMonthlyStatement,
  GetCenterProfile,
  ReadCenterLogo,
  ParentStatementPdfInput,
  ParentStatementPdfChild,
  ParentStatementChild,
  InvoiceLine,
  CenterCode,
  ParentId,
} from '@centresoutien/domain';

export type ParentStatementAssemblyDeps = {
  getParentMonthlyStatement: Pick<GetParentMonthlyStatement, 'execute'>;
  getCenterProfile: Pick<GetCenterProfile, 'execute'>;
  readCenterLogo: Pick<ReadCenterLogo, 'execute'>;
};

function toPdfLine(line: InvoiceLine) {
  return { label: { fr: line.label.fr, ar: line.label.ar }, amountMad: line.amountMad };
}

function toPdfChild(child: ParentStatementChild): ParentStatementPdfChild {
  return {
    childName: { fr: child.childName.fr, ar: child.childName.ar },
    invoiceId: child.invoiceId,
    invoiceStatus: child.invoiceStatus,
    paymentStatus: child.childStatus,
    regularLines: child.regularLines.map(toPdfLine),
    examPrepLines: child.examPrepLines.map(toPdfLine),
    regularSubtotalMad: child.regularSubtotalMad,
    examPrepSubtotalMad: child.examPrepSubtotalMad,
    childTotalMad: child.childTotalMad,
    childNetPaidMad: child.childNetPaidMad,
    childOutstandingMad: child.childOutstandingMad,
  };
}

/** Assembles the {@link ParentStatementPdfRenderer} input by running the derived
 *  {@link GetParentMonthlyStatement} read model and resolving the center profile
 *  (+ logo bytes) — pure DTO assembly, no business decisions, mirroring
 *  `buildInvoicePdfInput`. The statement's per-child money/status is already
 *  domain-derived; this only maps entities to the flat PDF line shape. */
export async function buildParentStatementPdfInput(
  deps: ParentStatementAssemblyDeps,
  centerCode: CenterCode,
  parentId: ParentId,
  month: string,
  locale: 'fr' | 'ar',
): Promise<ParentStatementPdfInput> {
  const [view, center] = await Promise.all([
    deps.getParentMonthlyStatement.execute({ centerCode, parentId, month }),
    deps.getCenterProfile.execute(),
  ]);
  const logoBytes = center?.logoPath ? await deps.readCenterLogo.execute({ path: center.logoPath }) : null;

  return {
    locale,
    parentName: view.parentName,
    month: view.month,
    children: view.perChild.map(toPdfChild),
    grandTotalMad: view.grandTotalMad,
    totalReceivedMad: view.totalReceivedMad,
    outstandingMad: view.outstandingMad,
    aggregateStatus: view.aggregateStatus,
    center: {
      name: center?.name ?? '',
      address: center?.address ?? '',
      phone: center?.phone ?? '',
      email: center?.email ?? '',
      logoBytes,
    },
  };
}
