import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { InvoiceAllocationDialog } from './invoice-allocation-dialog';

/**
 * The per-invoice subject-attribution control (SOU-298), gated behind
 * `payroll.teacher` (the override feeds teacher fee attribution). Renders the
 * current mode — weighted default or a manual N-subject split — and opens the
 * editor. Hidden entirely when the plan lacks the feature, so no plan-name check
 * ever leaks into the component (CLAUDE.md §4).
 */
export function InvoiceAllocationCard({ invoice }: { invoice: InvoiceListItemView }) {
  const { t } = useTranslation();
  const canManageAllocation = useFeature('payroll.teacher');
  const [open, setOpen] = useState(false);

  if (!canManageAllocation) return null;

  const allocation = invoice.subjectAllocation ?? null;
  const isManual = allocation !== null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <SlidersHorizontal className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-foreground">{t('invoices.detail.allocation.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {isManual
              ? t('invoices.detail.allocation.stateManual', { count: allocation.length })
              : t('invoices.detail.allocation.stateWeighted')}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setOpen(true)}>
        {t('invoices.detail.allocation.configure')}
      </Button>

      {open && <InvoiceAllocationDialog invoice={invoice} open={open} onOpenChange={setOpen} />}
    </div>
  );
}
