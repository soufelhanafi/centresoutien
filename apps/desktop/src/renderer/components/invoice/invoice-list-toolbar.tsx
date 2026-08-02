import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@centresoutien/ui';
import type { PaymentStatus } from '../../lib/invoices/invoice-view';

const ALL = '__all__';
const PAYMENT_STATUSES: readonly PaymentStatus[] = ['unpaid', 'partially-paid', 'paid'];

type InvoiceListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  month: string;
  onMonthChange: (value: string) => void;
  paymentStatus: PaymentStatus | '';
  onPaymentStatusChange: (value: PaymentStatus | '') => void;
};

/** Student-name search + month + derived payment-status filters (SOU-69). */
export function InvoiceListToolbar({
  search,
  onSearchChange,
  month,
  onMonthChange,
  paymentStatus,
  onPaymentStatusChange,
}: InvoiceListToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('invoices.search')}
          aria-label={t('invoices.searchLabel')}
          className="ps-9"
        />
      </div>

      <Input
        type="month"
        dir="ltr"
        value={month}
        onChange={(event) => onMonthChange(event.target.value)}
        aria-label={t('invoices.filters.monthLabel')}
        className="sm:w-44"
      />

      <Select
        value={paymentStatus === '' ? ALL : paymentStatus}
        onValueChange={(value) => onPaymentStatusChange(value === ALL ? '' : (value as PaymentStatus))}
      >
        <SelectTrigger className="sm:w-48" aria-label={t('invoices.filters.statusLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('invoices.filters.statusAll')}</SelectItem>
          {PAYMENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {t(`invoices.status.${status}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
