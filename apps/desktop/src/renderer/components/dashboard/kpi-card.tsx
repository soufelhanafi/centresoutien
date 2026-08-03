import type { ReactNode } from 'react';
import { cn } from '@centresoutien/ui';

type KpiCardProps = {
  label: string;
  value: ReactNode;
  /** `warning` highlights the figure (design 1a's warning role) — used for the unpaid-invoice count. */
  tone?: 'default' | 'warning';
};

/**
 * One Basique dashboard KPI tile: label, JetBrains Mono figure, optional
 * warning tone. `text-start` on the outer block follows the page direction
 * (matching the label above it); `dir="ltr"` is scoped to the inline figure
 * only, so it fixes digit order without dragging the block's own alignment
 * to the left in RTL.
 */
export function KpiCard({ label, value, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 block text-start font-mono text-2xl font-semibold tabular-nums',
          tone === 'warning' && 'text-warning',
        )}
      >
        <span dir="ltr">{value}</span>
      </p>
    </div>
  );
}
