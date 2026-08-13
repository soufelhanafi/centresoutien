import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { Skeleton } from '@centresoutien/ui';

const KPI_CARD = 'flex flex-col gap-2 rounded-xl border border-border bg-card p-4';
const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

const KPI_KEYS = ['revenue', 'students', 'unpaid', 'sessions'] as const;
const PREVIEW_ROWS = [0, 1, 2] as const;

/**
 * Decorative preview of the consolidated multi-center dashboard, shown blurred
 * behind the upsell lock. No real data: the desktop keeps each center's DB
 * isolated (CLAUDE.md §5ter) — cross-center aggregation is a cloud-only feature,
 * so this only communicates the shape of what the web tier delivers.
 */
export function DashboardConsolidatedPreview() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {KPI_KEYS.map((key) => (
          <div key={key} className={KPI_CARD}>
            <p className={SECTION_LABEL}>{t(`dashboard.consolidated.kpi.${key}`)}</p>
            <Skeleton className="h-7 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className={SECTION_LABEL}>{t('dashboard.consolidated.breakdown.title')}</p>
        <div className="mt-3 flex flex-col gap-3">
          {PREVIEW_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="ms-auto h-4 w-16 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-4 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
