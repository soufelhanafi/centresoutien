import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { OpenInvoicePicker } from '../../components/payments/open-invoice-picker';
import { RecentPaymentsFeed } from '../../components/payments/recent-payments-feed';

const RECORD_TAB = 'record';
const FEED_TAB = 'feed';

/**
 * Cash-desk module (SOU-198, SOU-222): a tabbed workspace for recording a payment
 * against an open invoice and reviewing the cross-invoice recent-payments feed.
 * Radix `TabsContent` unmounts the inactive panel, so each tab's underlying query
 * only fires once its tab is selected. A future Impayés tab (SOU-224) slots in as
 * an additional trigger + content pair. Distinct from the Invoices list (billing).
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

      <Tabs defaultValue={RECORD_TAB} className="flex flex-col gap-4">
        <TabsList aria-label={t('payments.tabsLabel')} className="w-full max-w-md">
          <TabsTrigger value={RECORD_TAB}>{t('payments.record.title')}</TabsTrigger>
          <TabsTrigger value={FEED_TAB}>{t('payments.feed.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value={RECORD_TAB}>
          <OpenInvoicePicker />
        </TabsContent>

        <TabsContent value={FEED_TAB}>
          <RecentPaymentsFeed />
        </TabsContent>
      </Tabs>
    </section>
  );
}
