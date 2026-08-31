import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from '@tanstack/react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { DEFAULT_ROUTE } from '../../app/nav-items';
import { useUserPermission } from '../../hooks/use-user-permission';
import { OpenInvoicePicker } from '../../components/payments/open-invoice-picker';
import { RecentPaymentsFeed } from '../../components/payments/recent-payments-feed';
import {
  EMPTY_RECENT_PAYMENTS_FILTERS,
  type RecentPaymentsFilterState,
} from '../../components/payments/recent-payments-filters';
import { ArrearsPanel } from '../../components/arrears/arrears-panel';
import { DayCloseContainer } from '../../components/day-close/day-close-container';

const RECORD_TAB = 'record';
const FEED_TAB = 'feed';
const ARREARS_TAB = 'arrears';

/**
 * Cash-desk module (SOU-198, SOU-222, SOU-224): a tabbed workspace for recording a
 * payment against an open invoice, reviewing the cross-invoice recent-payments feed,
 * and chasing overdue invoices (Impayés). Radix `TabsContent` unmounts the inactive
 * panel, so each tab's underlying query only fires once its tab is selected; the
 * picker's search term and the feed's day-window/method filters are held here so they
 * survive that remount, and the cash-desk queries carry a short `staleTime` so
 * re-entering a tab reuses the cache instead of refetching. Distinct from the Invoices
 * list (billing).
 */
export function PaymentsPage() {
  const { t } = useTranslation();
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [feedFilters, setFeedFilters] = useState<RecentPaymentsFilterState>(
    EMPTY_RECENT_PAYMENTS_FILTERS,
  );
  const hasPermission = useUserPermission('nav.payments');

  // Direct hash navigation bypasses the sidebar's own hiding (nav-item.tsx) — the
  // route itself must refuse a denied assistant too, not just the link to it.
  if (!hasPermission) return <Navigate to={DEFAULT_ROUTE} replace />;

  return (
    <section aria-labelledby="payments-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="space-y-1 print:hidden">
        <h1 id="payments-title" className="text-xl font-semibold text-foreground">
          {t('payments.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('payments.subtitle')}</p>
      </header>

      <DayCloseContainer />

      <Tabs defaultValue={RECORD_TAB} className="flex flex-col gap-4">
        <TabsList aria-label={t('payments.tabsLabel')} className="w-full max-w-xl print:hidden">
          <TabsTrigger value={RECORD_TAB}>{t('payments.record.title')}</TabsTrigger>
          <TabsTrigger value={FEED_TAB}>{t('payments.feed.title')}</TabsTrigger>
          <TabsTrigger value={ARREARS_TAB}>{t('arrears.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value={RECORD_TAB}>
          <OpenInvoicePicker search={invoiceSearch} onSearchChange={setInvoiceSearch} />
        </TabsContent>

        <TabsContent value={FEED_TAB}>
          <RecentPaymentsFeed filters={feedFilters} onFiltersChange={setFeedFilters} />
        </TabsContent>

        <TabsContent value={ARREARS_TAB}>
          <ArrearsPanel />
        </TabsContent>
      </Tabs>
    </section>
  );
}
