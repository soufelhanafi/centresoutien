import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ReceiptText } from 'lucide-react';
import { Button, EmptyState, ErrorState, Input, Skeleton } from '@centresoutien/ui';
import { useOpenInvoices } from '../../hooks/invoice/use-open-invoices';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { OpenInvoiceRow } from './open-invoice-row';

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Picks an open invoice (outstanding balance, not cancelled) to record a payment
 * against. Sources its rows from the bounded server-side `openOnly` read —
 * name-searched and keyset-paginated (SOU-200) — so the renderer never loads or
 * filters the whole invoice list. Each row's student name is resolved server-side
 * on the read row, so no full-student-list fetch is needed.
 */
export function OpenInvoicePicker() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const invoicesQuery = useOpenInvoices(debouncedSearch);

  const openInvoices = useMemo(
    () => (invoicesQuery.data?.pages ?? []).flatMap((page) => page.invoices),
    [invoicesQuery.data],
  );

  const isSearching = debouncedSearch.length > 0;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-labelledby="record-payment-title">
      <div className="space-y-1">
        <h2 id="record-payment-title" className="text-sm font-semibold text-foreground">
          {t('payments.record.title')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('payments.record.subtitle')}</p>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('payments.record.search')}
          aria-label={t('payments.record.searchLabel')}
          className="ps-9"
        />
      </div>

      {invoicesQuery.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {invoicesQuery.isError && (
        <ErrorState
          icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
          title={t('payments.record.loadError')}
          action={
            <Button variant="outline" size="sm" onClick={() => void invoicesQuery.refetch()}>
              {t('payments.retry')}
            </Button>
          }
        />
      )}

      {invoicesQuery.data && openInvoices.length === 0 && (
        <EmptyState
          icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
          title={isSearching ? t('payments.record.noResultsTitle') : t('payments.record.emptyTitle')}
          description={isSearching ? t('payments.record.noResultsBody') : t('payments.record.emptyBody')}
        />
      )}

      {invoicesQuery.data && openInvoices.length > 0 && (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {openInvoices.map((invoice) => (
              <OpenInvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </ul>
          {invoicesQuery.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={invoicesQuery.isFetchingNextPage}
              onClick={() => void invoicesQuery.fetchNextPage()}
            >
              {t('payments.record.loadMore')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
