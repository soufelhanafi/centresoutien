import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { useFeature } from '../../hooks/use-feature';
import { InvoiceRow } from './invoice-row';

const COLUMNS = ['1fr', '1.6fr', '1fr', '1.2fr'] as const;
const COLUMNS_WITH_ACTIONS = [...COLUMNS, 'auto'];

/**
 * The invoices list as an accessible grid-styled table, mirroring `FormulaTable`.
 * The trailing actions column carries the per-responsible "Facture groupée"
 * trigger (SOU-284), shown only when the active plan includes both the invoicing
 * and parents features.
 */
export function InvoiceTable({
  invoices,
  studentsById,
  month,
}: {
  invoices: readonly InvoiceListItemView[];
  studentsById: ReadonlyMap<string, StudentView>;
  month?: string | undefined;
}) {
  const { t } = useTranslation();
  const hasInvoicing = useFeature('core.invoicing');
  const hasParents = useFeature('core.parents');
  const showFactureGroupee = hasInvoicing && hasParents;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={showFactureGroupee ? COLUMNS_WITH_ACTIONS : COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('invoices.table.month')}</DataTableHead>
            <DataTableHead>{t('invoices.table.student')}</DataTableHead>
            <DataTableHead>{t('invoices.table.total')}</DataTableHead>
            <DataTableHead>{t('invoices.table.status')}</DataTableHead>
            {showFactureGroupee && (
              <DataTableHead>
                <span className="sr-only">{t('invoices.factureGroupee.columnHeader')}</span>
              </DataTableHead>
            )}
          </DataTableRow>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              student={studentsById.get(invoice.studentId)}
              month={month ?? invoice.month}
              showFactureGroupee={showFactureGroupee}
            />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
