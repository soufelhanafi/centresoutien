import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@centresoutien/ui';
import { formatSignedPercent } from '../../lib/format';

/**
 * The month-over-month collected-revenue delta as a signed percent with a trend
 * icon. The diagonal trend glyph carries horizontal direction, so it mirrors in
 * RTL (`rtl:-scale-x-100`). A `null` growth (no prior-month baseline) renders a
 * neutral dash, never a fake 0 %.
 */
export function GrowthIndicator({ percent, locale }: { percent: number | null; locale: string }) {
  const { t } = useTranslation();

  if (percent === null) {
    return (
      <span className="text-muted-foreground" title={t('multiCenterStats.growth.noBaseline')}>
        —
      </span>
    );
  }

  const isUp = percent > 0;
  const isDown = percent < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const tone = isUp ? 'text-success' : isDown ? 'text-destructive' : 'text-muted-foreground';

  return (
    <span className={cn('inline-flex items-center gap-1 font-medium tabular-nums', tone)}>
      <Icon className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
      {formatSignedPercent(percent, locale)}
    </span>
  );
}
