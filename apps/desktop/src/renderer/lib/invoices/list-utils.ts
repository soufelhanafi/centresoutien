import type { StudentView } from '../students/student-view';
import type { InvoiceListItemView } from './invoice-view';

/**
 * Client-side student-name search layered on top of the gateway's server-side
 * month/paymentStatus filters — `ListInvoices` filters by exact `studentId`,
 * not free text, so resolving "does this invoice's student match the typed
 * name" happens here against the already-loaded student map.
 */
export function filterInvoicesBySearch(
  invoices: readonly InvoiceListItemView[],
  studentsById: ReadonlyMap<string, StudentView>,
  search: string,
): readonly InvoiceListItemView[] {
  const needle = search.trim().toLowerCase();
  if (needle === '') return invoices;

  return invoices.filter((invoice) => {
    const student = studentsById.get(invoice.studentId);
    if (!student) return false;
    return (
      student.name.fr.toLowerCase().includes(needle) || student.name.ar.toLowerCase().includes(needle)
    );
  });
}
