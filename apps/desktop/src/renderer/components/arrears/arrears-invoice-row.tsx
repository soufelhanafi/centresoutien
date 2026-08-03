import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleDollarSign, ExternalLink } from 'lucide-react';
import { Badge, Button, BilingualText, DataTableCell, DataTableRow, Numeric, StatusBadge } from '@centresoutien/ui';
import type { OverdueInvoiceView } from '../../lib/arrears/arrears-view';
import { agingBadgeVariant, agingBucketLabelKey } from '../../lib/arrears/aging-badge';
import { formatMonth, formatMoneyMad } from '../../lib/format';
import { arrearsKeys } from '../../hooks/arrears/keys';
import { RecordPaymentDialog } from '../invoice/record-payment-dialog';

/** One overdue invoice: student, month, aging bucket, amount due, status, and the two quick actions. */
export function ArrearsInvoiceRow({ invoice }: { invoice: OverdueInvoiceView }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);

  // `RecordPaymentDialog` (SOU-101) only invalidates the invoices module's own
  // query keys. A paid-down invoice must also drop off (or shrink on) this
  // list, so closing the dialog refetches the arrears list too — cheap and
  // idempotent whether the payment was actually submitted or just cancelled.
  const onPayOpenChange = (open: boolean) => {
    setPayOpen(open);
    if (!open) void queryClient.invalidateQueries({ queryKey: arrearsKeys.all });
  };

  return (
    <DataTableRow>
      <DataTableCell>
        <span className="font-medium text-foreground">{invoice.studentName.fr}</span>
        <BilingualText
          value={invoice.studentName.ar}
          script="arabic"
          className="mt-0.5 block text-xs text-muted-foreground"
        />
      </DataTableCell>
      <DataTableCell>{formatMonth(invoice.month, i18n.language)}</DataTableCell>
      <DataTableCell>
        <Badge variant={agingBadgeVariant(invoice.agingBucket)} shape="pill" dot>
          {t(agingBucketLabelKey(invoice.agingBucket))}
        </Badge>
      </DataTableCell>
      <DataTableCell>
        <Numeric>{formatMoneyMad(invoice.outstandingMad, i18n.language)}</Numeric>
      </DataTableCell>
      <DataTableCell>
        <StatusBadge status={invoice.status} label={t(`invoices.status.${invoice.status}`)} />
      </DataTableCell>
      <DataTableCell className="text-end">
        <div className="flex items-center justify-end gap-1.5 print:hidden">
          <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
            {t('arrears.actions.recordPayment')}
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/invoicing/$invoiceId" params={{ invoiceId: invoice.invoiceId }}>
              <ExternalLink className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              {t('arrears.actions.openInvoice')}
            </Link>
          </Button>
        </div>
      </DataTableCell>

      <RecordPaymentDialog
        invoiceId={invoice.invoiceId}
        outstandingMad={invoice.outstandingMad}
        open={payOpen}
        onOpenChange={onPayOpenChange}
      />
    </DataTableRow>
  );
}
