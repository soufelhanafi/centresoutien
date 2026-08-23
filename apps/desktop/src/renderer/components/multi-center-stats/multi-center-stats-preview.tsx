import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { Skeleton } from '@centresoutien/ui';

const CARD = 'flex flex-col gap-2 rounded-xl border border-border bg-card p-4';
const LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';
const TOTAL_KEYS = ['revenue', 'collected', 'students', 'unpaidRate'] as const;
const PREVIEW_ROWS = [0, 1, 2, 3] as const;

/**
 * Decorative preview of the per-center stats table, shown blurred behind the
 * Premium upsell lock. No real figures — it only communicates the shape of the
 * comparison the Premium tier unlocks (SOU-106).
 */
export function MultiCenterStatsPreview() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3.5" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {TOTAL_KEYS.map((key) => (
          <div key={key} className={CARD}>
            <p className={LABEL}>{t(`multiCenterStats.totals.${key}`)}</p>
            <Skeleton className="h-6 w-3/4 rounded" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3">
          {PREVIEW_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="ms-auto h-4 w-20 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-4 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
