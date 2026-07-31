import { Skeleton } from '@centresoutien/ui';
import { WEEKDAYS } from '@centresoutien/domain';

const GRID_COLUMNS = '3.5rem repeat(7, minmax(0, 1fr))';

/** Loading placeholder that mirrors the grid frame so the layout doesn't jump. */
export function PlannerGridSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden="true">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        <div className="border-b border-border p-2" />
        {WEEKDAYS.map((day) => (
          <div key={day} className="border-b border-s border-border p-2">
            <Skeleton className="mx-auto h-4 w-16" />
          </div>
        ))}
        <div className="h-80" />
        {WEEKDAYS.map((day) => (
          <div key={day} className="space-y-2 border-s border-border p-1.5">
            {day % 2 === 0 ? <Skeleton className="h-14 w-full" /> : null}
            {day % 3 === 0 ? <Skeleton className="mt-8 h-20 w-full" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
