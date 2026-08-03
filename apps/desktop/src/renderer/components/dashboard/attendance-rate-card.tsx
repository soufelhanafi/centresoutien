/** Avancé widget: current calendar month's present-rate across every roll-call outcome. */
export function AttendanceRateCard({ percent }: { percent: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <span dir="ltr" className="font-mono text-4xl font-semibold tabular-nums text-foreground">
        {percent}%
      </span>
      <div className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ inlineSize: `${percent}%` }} />
      </div>
    </div>
  );
}
