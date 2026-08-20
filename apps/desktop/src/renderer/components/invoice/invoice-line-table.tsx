import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';
import type { InvoiceLineView, InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { formatMoneyMad } from '../../lib/format';
import { InvoiceLineGroup } from './invoice-line-group';
import { EditLineAmountDialog } from './edit-line-amount-dialog';

/** The invoice's lines in a document-style table: column headers, one tbody per
 *  kind (regular then exam-prep, CLAUDE.md §7), and the grand total footer.
 *  Draft invoices additionally expose a per-line amount override (SOU-289). */
export function InvoiceLineTable({ invoice }: { invoice: InvoiceListItemView }) {
  const { t, i18n } = useTranslation();
  const [editedLine, setEditedLine] = useState<InvoiceLineView | null>(null);
  const regularLines = invoice.lines.filter((line) => line.kind === 'regular');
  const examPrepLines = invoice.lines.filter((line) => line.kind === 'exam-prep');
  const onEditLine = invoice.status === 'draft' ? setEditedLine : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="px-6 py-3.5 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {t('invoices.detail.lineDescription')}
            </th>
            <th
              scope="col"
              className="px-6 py-3.5 text-end text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {t('invoices.detail.lineAmount')}
            </th>
          </tr>
        </thead>
        <InvoiceLineGroup kind="regular" lines={regularLines} onEditLine={onEditLine} />
        <InvoiceLineGroup kind="exam-prep" lines={examPrepLines} onEditLine={onEditLine} />
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/40">
            <td className="px-6 py-4 text-base font-semibold text-foreground">{t('invoices.detail.total')}</td>
            <td className="px-6 py-4 text-end">
              <Numeric className="text-base font-semibold text-foreground">
                {formatMoneyMad(invoice.totalMad, i18n.language)}
              </Numeric>
            </td>
          </tr>
        </tfoot>
      </table>

      {onEditLine !== undefined && (
        <EditLineAmountDialog invoiceId={invoice.id} line={editedLine} onClose={() => setEditedLine(null)} />
      )}
    </div>
  );
}
