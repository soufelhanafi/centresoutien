import { useTranslation } from 'react-i18next';
import type { DashboardBasicSummaryView } from '../../lib/dashboard/dashboard-view';
import { formatMonth } from '../../lib/format';
import { TakingsSummary } from '../payments/takings-summary';
import { ArgentCard } from './argent-card';
import { PaidInvoicesCard } from './paid-invoices-card';

const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

/**
 * The Argent block (design 1b): 4 monthly cards — Facturé / Encaissé / Impayé /
 * Factures payées — plus today's takings (SOU-223), which reuses the cap-free
 * `payment.takings` read path and its own loading/error states.
 */
export function ArgentSection({ argent }: { argent: DashboardBasicSummaryView['argent'] }) {
  const { t, i18n } = useTranslation();

  return (
    <section aria-labelledby="dashboard-basic-argent">
      <h2 id="dashboard-basic-argent" className={SECTION_LABEL}>
        {t('dashboard.basic.sections.argent', { month: formatMonth(argent.month, i18n.language) })}
      </h2>
      <div className="mt-2.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <ArgentCard
          label={t('dashboard.basic.argent.billed')}
          amountMad={argent.billedMad}
          delta={{ kind: 'percent', value: argent.deltas.billed.deltaPercent }}
          upIsGood
          month={argent.month}
        />
        <ArgentCard
          label={t('dashboard.basic.argent.collected')}
          amountMad={argent.collectedMad}
          delta={{ kind: 'percent', value: argent.deltas.collected.deltaPercent }}
          upIsGood
          month={argent.month}
        />
        <ArgentCard
          label={t('dashboard.basic.argent.unpaid')}
          amountMad={argent.unpaidMad}
          delta={
            argent.prevMonth.unpaidMad !== 0
              ? { kind: 'amount', value: argent.unpaidMad - argent.prevMonth.unpaidMad }
              : undefined
          }
          upIsGood={false}
          month={argent.month}
          tone="warning"
        />
        <PaidInvoicesCard
          paidCount={argent.paidInvoices.paidCount}
          totalCount={argent.paidInvoices.totalCount}
        />
      </div>
      <div className="mt-3.5">
        <TakingsSummary />
      </div>
    </section>
  );
}
