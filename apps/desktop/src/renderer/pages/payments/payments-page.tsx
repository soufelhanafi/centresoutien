import { useTranslation } from 'react-i18next';
import { TakingsSummary } from '../../components/payments/takings-summary';
import { OpenInvoicePicker } from '../../components/payments/open-invoice-picker';
import { RecentPaymentsFeed } from '../../components/payments/recent-payments-feed';

/**
 * Cash-desk module (SOU-198): today's takings, fast record-payment entry against
 * an open invoice, and the cross-invoice recent-payments feed. Distinct from the
 * Invoices list (billing) and the Impayés follow-up (arrears).
 */
export function PaymentsPage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="payments-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="payments-title" className="text-xl font-semibold text-foreground">
          {t('payments.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('payments.subtitle')}</p>
      </header>

      <TakingsSummary />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <OpenInvoicePicker />
        <RecentPaymentsFeed />
      </div>
    </section>
  );
}
