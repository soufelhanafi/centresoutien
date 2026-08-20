import { useTranslation } from 'react-i18next';
import { ReceiptText } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { InvoiceTable } from './invoice-table';

export type InvoiceListStatus = 'loading' | 'error' | 'empty' | 'noResults' | 'ready';

type InvoiceListContentProps = {
  status: InvoiceListStatus;
  invoices: readonly InvoiceListItemView[];
  studentsById: ReadonlyMap<string, StudentView>;
  onRetry: () => void;
  /** Overrides the center-wide empty-state copy (e.g. the student detail's Factures tab, SOU-289). */
  empty?: { title: string; description: string } | undefined;
};

/** Renders the correct state for the list: loading, error, empty, no-results, or table. */
export function InvoiceListContent({ status, invoices, studentsById, onRetry, empty }: InvoiceListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
        title={t('invoices.loadError.title')}
        description={t('invoices.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('invoices.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
        title={empty?.title ?? t('invoices.empty.title')}
        description={empty?.description ?? t('invoices.empty.body')}
      />
    );
  }

  if (status === 'noResults') {
    return (
      <EmptyState
        icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
        title={t('invoices.noResults.title')}
        description={t('invoices.noResults.body')}
      />
    );
  }

  return <InvoiceTable invoices={invoices} studentsById={studentsById} />;
}
