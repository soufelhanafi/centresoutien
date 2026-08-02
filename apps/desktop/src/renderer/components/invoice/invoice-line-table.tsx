import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { formatMoneyMad } from '../../lib/format';
import { InvoiceLineGroup } from './invoice-line-group';

/** The invoice's lines, grouped regular then exam-prep, with the grand total (CLAUDE.md §7). */
export function InvoiceLineTable({ invoice }: { invoice: InvoiceListItemView }) {
  const { t, i18n } = useTranslation();
  const regularLines = invoice.lines.filter((line) => line.kind === 'regular');
  const examPrepLines = invoice.lines.filter((line) => line.kind === 'exam-prep');

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <InvoiceLineGroup kind="regular" lines={regularLines} />
      <InvoiceLineGroup kind="exam-prep" lines={examPrepLines} />
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-foreground">{t('invoices.detail.total')}</span>
        <Numeric className="text-sm font-semibold text-foreground">
          {formatMoneyMad(invoice.totalMad, i18n.language)}
        </Numeric>
      </div>
    </div>
  );
}
