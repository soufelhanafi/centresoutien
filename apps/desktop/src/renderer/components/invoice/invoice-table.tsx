import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { InvoiceRow } from './invoice-row';

const COLUMNS = ['1fr', '1.6fr', '1fr', '1.2fr'] as const;

/** The invoices list as an accessible grid-styled table, mirroring `FormulaTable`. */
export function InvoiceTable({
  invoices,
  studentsById,
}: {
  invoices: readonly InvoiceListItemView[];
  studentsById: ReadonlyMap<string, StudentView>;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('invoices.table.month')}</DataTableHead>
            <DataTableHead>{t('invoices.table.student')}</DataTableHead>
            <DataTableHead>{t('invoices.table.total')}</DataTableHead>
            <DataTableHead>{t('invoices.table.status')}</DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} student={studentsById.get(invoice.studentId)} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
