import type { GetCenterProfile, GetStudent, ReadCenterLogo, InvoiceListItem, InvoiceLine, InvoicePdfInput, CenterCode, StudentId } from '@centresoutien/domain';
import { invoiceTotalMad } from '@centresoutien/domain';

export type PdfAssemblyDeps = {
  getCenterProfile: Pick<GetCenterProfile, 'execute'>;
  getStudent: Pick<GetStudent, 'execute'>;
  readCenterLogo: Pick<ReadCenterLogo, 'execute'>;
};

function toPdfLine(line: InvoiceLine) {
  return { label: { fr: line.label.fr, ar: line.label.ar }, amountMad: line.amountMad };
}

/** Assembles the {@link InvoicePdfRenderer} input by resolving the invoice's
 *  student name and the center profile (+ logo bytes) alongside the already
 *  domain-derived totals — pure DTO assembly, no business decisions, mirroring
 *  every other `toXxxView` projector in `handlers.ts`. */
export async function buildInvoicePdfInput(
  deps: PdfAssemblyDeps,
  centerCode: CenterCode,
  item: InvoiceListItem,
  locale: 'fr' | 'ar',
): Promise<InvoicePdfInput> {
  const [student, center] = await Promise.all([
    deps.getStudent.execute({ centerCode, id: item.invoice.studentId as StudentId }),
    deps.getCenterProfile.execute(),
  ]);
  const logoBytes = center?.logoPath ? await deps.readCenterLogo.execute({ path: center.logoPath }) : null;
  const regularLines = item.lines.filter((line) => line.kind === 'regular');
  const examPrepLines = item.lines.filter((line) => line.kind === 'exam-prep');

  return {
    locale,
    invoiceId: item.invoice.id,
    month: item.invoice.month,
    status: item.invoice.status,
    issuedAt: item.invoice.issuedAt,
    student: student ? { fr: student.name.fr, ar: student.name.ar } : { fr: '—', ar: '—' },
    regularLines: regularLines.map(toPdfLine),
    examPrepLines: examPrepLines.map(toPdfLine),
    regularSubtotalMad: invoiceTotalMad(regularLines),
    examPrepSubtotalMad: invoiceTotalMad(examPrepLines),
    totalMad: item.totalMad,
    netPaidMad: item.netPaidMad,
    outstandingMad: item.outstandingMad,
    paymentStatus: item.status,
    center: {
      name: center?.name ?? '',
      address: center?.address ?? '',
      phone: center?.phone ?? '',
      email: center?.email ?? '',
      logoBytes,
    },
  };
}
