import { useTranslation } from 'react-i18next';
import { cn, Numeric } from '@centresoutien/ui';

/**
 * Seat-fill indicator: a bar plus the `enrolled / capacity` count. Turns to the
 * "full" tone once every seat is taken. Reused in the list row and the detail
 * header. Purely presentational — the count comes from the SOU-127 read model.
 */
export function GroupFill({ enrolled, capacity }: { enrolled: number; capacity: number }) {
  const { t } = useTranslation();
  const pct = capacity > 0 ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;
  const full = capacity > 0 && enrolled >= capacity;

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={t('groups.fill.label')}
        aria-valuenow={enrolled}
        aria-valuemin={0}
        aria-valuemax={capacity}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', full ? 'bg-destructive' : 'bg-primary')}
          style={{ inlineSize: `${pct}%` }}
        />
      </div>
      <Numeric>{t('groups.fill.count', { enrolled, capacity })}</Numeric>
    </div>
  );
}
