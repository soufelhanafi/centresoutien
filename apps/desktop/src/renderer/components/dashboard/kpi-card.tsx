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
 * warning tone. `dir="ltr"` keeps digit order stable in Arabic without the
 * table-only end-alignment `Numeric` applies — this is a standalone figure,
 * not a table cell.
 */
export function KpiCard({ label, value, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <span
        dir="ltr"
        className={cn(
          'mt-1 block font-mono text-2xl font-semibold tabular-nums text-start',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </span>
    </div>
  );
}
