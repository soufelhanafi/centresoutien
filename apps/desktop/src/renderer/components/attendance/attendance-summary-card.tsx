import { Numeric } from '@centresoutien/ui';

/**
 * Attendance summary metric card — used by the student attendance tab (SOU-108)
 * and reused by the dashboard basic summary (SOU-100). Negative variant renders
 * a destructive-tinted border for the absence streak flag.
 */
export function AttendanceSummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'negative' | undefined;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3 ${variant === 'negative' ? 'border-destructive/20 bg-destructive/5' : ''}`}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <Numeric className="text-lg font-semibold" data-negative={variant === 'negative'}>
        {value}
      </Numeric>
    </div>
  );
}
