import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';
import { useWeekSessions } from '../../hooks/planning/use-week-sessions';
import { PlannerToolbar } from '../../components/planning/planner-toolbar';
import { PlannerGrid } from '../../components/planning/planner-grid';
import { PlannerGridSkeleton } from '../../components/planning/planner-grid-skeleton';
import { SessionTemplateDialog } from '../../components/planning/session-template-dialog';
import type { PlannerSessionView } from '../../lib/planning/planner-view';
import {
  applyFilters,
  deriveFilterOptions,
  NO_FILTERS,
  type PlannerFilters,
} from '../../lib/planning/filters';
import { deriveTimeRange } from '../../lib/planning/time-range';

/**
 * Weekly planner: a 7-column × time-slot grid of the center's recurring
 * sessions, colour-coded by subject, filterable by teacher / room / level (and
 * exam-prep kind on Pro+). Clicking a block opens its session template. Runs
 * against the mock gateway until the `session.week` read model is enriched.
 */
export function PlannerPage() {
  const { t } = useTranslation();
  const query = useWeekSessions();
  const [filters, setFilters] = useState<PlannerFilters>(NO_FILTERS);
  const [selected, setSelected] = useState<PlannerSessionView | null>(null);

  const week = useMemo(() => query.data ?? [], [query.data]);
  const range = useMemo(() => deriveTimeRange(week), [week]);
  const options = useMemo(() => deriveFilterOptions(week), [week]);
  const filtered = useMemo(() => applyFilters(week, filters), [week, filters]);

  const patchFilters = (patch: Partial<PlannerFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <section aria-labelledby="planning-title" className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="planning-title" className="text-xl font-semibold text-foreground">
          {t('planning.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('planning.subtitle')}</p>
      </header>

      {query.isPending ? (
        <PlannerGridSkeleton />
      ) : query.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">{t('planning.loadError.title')}</p>
          <p className="text-sm text-muted-foreground">{t('planning.loadError.body')}</p>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('planning.loadError.retry')}
          </Button>
        </div>
      ) : (
        <>
          <PlannerToolbar
            filters={filters}
            options={options}
            onChange={patchFilters}
            onReset={() => setFilters(NO_FILTERS)}
          />
          <PlannerGrid
            sessions={filtered}
            range={range}
            onSelect={setSelected}
            emptyLabel={week.length === 0 ? t('planning.empty.week') : t('planning.empty.noMatch')}
          />
        </>
      )}

      <SessionTemplateDialog session={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </section>
  );
}
