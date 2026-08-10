import { useTranslation } from 'react-i18next';
import { Badge, Numeric } from '@centresoutien/ui';
import type { RecentPaymentView } from '../../lib/payments/recent-payment-view';
import { formatDate, formatMoneyMad } from '../../lib/format';

/** One cross-invoice feed row: student, date, method, amount + a reversal marker. */
export function RecentPaymentRow({ payment }: { payment: RecentPaymentView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';
  const studentName = payment.studentName ? payment.studentName[locale] : t('payments.feed.unknownStudent');
  const isReversal = payment.kind === 'reversal';

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{studentName}</span>
          {isReversal && (
            <Badge variant="destructive" shape="rounded">
              {t('payments.feed.reversal')}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDate(payment.paidOn, i18n.language)} · {t(`invoices.detail.payment.methods.${payment.method}`)}
        </p>
      </div>
      <Numeric className={`shrink-0 text-sm font-medium ${isReversal ? 'text-[var(--badge-destructive-fg)]' : 'text-foreground'}`}>
        {isReversal ? `- ${formatMoneyMad(payment.amountMad, i18n.language)}` : formatMoneyMad(payment.amountMad, i18n.language)}
      </Numeric>
    </li>
  );
}
