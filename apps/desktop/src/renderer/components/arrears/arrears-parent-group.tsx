import { useTranslation } from 'react-i18next';
import { ChevronDown, Phone } from 'lucide-react';
import { Badge, DataTable, DataTableHead, DataTableRow, Numeric } from '@centresoutien/ui';
import type { ArrearsParentGroupView } from '../../lib/arrears/arrears-view';
import { agingBadgeVariant, agingBucketLabelKey } from '../../lib/arrears/aging-badge';
import { formatMoneyMad } from '../../lib/format';
import { ArrearsInvoiceRow } from './arrears-invoice-row';

const COLUMNS = ['1.6fr', '1fr', '1fr', '1fr', '1.1fr', '1.4fr'] as const;

type ArrearsParentGroupProps = {
  parent: ArrearsParentGroupView;
  expanded: boolean;
  onToggleExpand: () => void;
};

/** One parent's follow-up card: contact info + total due, expandable to every overdue invoice across their children. */
export function ArrearsParentGroup({ parent, expanded, onToggleExpand }: ArrearsParentGroupProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-2 p-4 text-start sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-2.5">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold text-foreground">
              {parent.parentName ?? t('arrears.parentCard.unlinkedParent')}
            </p>
            {parent.parentPhone !== null && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" aria-hidden="true" />
                <span dir="ltr">{parent.parentPhone}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={agingBadgeVariant(parent.oldestAgingBucket)} shape="pill" dot>
            {t(agingBucketLabelKey(parent.oldestAgingBucket))}
          </Badge>
          <div className="text-end">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t('arrears.parentCard.totalOutstanding')}
            </p>
            <Numeric className="text-sm font-semibold">
              {formatMoneyMad(parent.totalOutstandingMad, i18n.language)}
            </Numeric>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-border">
          <DataTable columns={COLUMNS}>
            <thead>
              <DataTableRow>
                <DataTableHead>{t('arrears.table.student')}</DataTableHead>
                <DataTableHead>{t('arrears.table.month')}</DataTableHead>
                <DataTableHead>{t('arrears.table.aging')}</DataTableHead>
                <DataTableHead>{t('arrears.table.amount')}</DataTableHead>
                <DataTableHead>{t('arrears.table.status')}</DataTableHead>
                <DataTableHead className="print:hidden">{t('arrears.table.actions')}</DataTableHead>
              </DataTableRow>
            </thead>
            <tbody>
              {parent.invoices.map((invoice) => (
                <ArrearsInvoiceRow key={invoice.invoiceId} invoice={invoice} />
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
