import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BilingualText, DataTableCell, DataTableRow, Numeric, StatusBadge } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { invoiceStatusLabelKey, invoiceStatusTone } from '../../lib/invoices/invoice-status-view';
import { formatMonth, formatMoneyMad } from '../../lib/format';
import { FactureGroupeeRowAction } from './facture-groupee-row-action';

/** One invoice row: month, bilingual student name, total, status, Facture groupée. */
export function InvoiceRow({
  invoice,
  student,
  month,
  showFactureGroupee,
}: {
  invoice: InvoiceListItemView;
  student: StudentView | undefined;
  month: string;
  showFactureGroupee: boolean;
}) {
  const { t, i18n } = useTranslation();
  const tone = invoiceStatusTone(invoice);

  return (
    <DataTableRow>
      <DataTableCell>{formatMonth(invoice.month, i18n.language)}</DataTableCell>
      <DataTableCell>
        <Link
          to="/invoicing/$invoiceId"
          params={{ invoiceId: invoice.id }}
          className="font-medium text-foreground hover:underline"
        >
          {student?.name.fr ?? t('invoices.unknownStudent')}
        </Link>
        {student && (
          <BilingualText
            value={student.name.ar}
            script="arabic"
            className="mt-0.5 block text-xs text-muted-foreground"
          />
        )}
      </DataTableCell>
      <DataTableCell>
        <Numeric>{formatMoneyMad(invoice.totalMad, i18n.language)}</Numeric>
      </DataTableCell>
      <DataTableCell>
        <StatusBadge status={tone} label={t(invoiceStatusLabelKey(tone))} />
      </DataTableCell>
      {showFactureGroupee && (
        <DataTableCell className="text-end">
          <FactureGroupeeRowAction student={student} month={month} />
        </DataTableCell>
      )}
    </DataTableRow>
  );
}
