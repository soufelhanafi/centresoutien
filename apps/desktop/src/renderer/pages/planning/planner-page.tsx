import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CalendarDays, Wand2 } from 'lucide-react';
import { Button, ErrorState } from '@centresoutien/ui';
import { useWeekSessions } from '../../hooks/planning/use-week-sessions';
import { useCenterHours } from '../../hooks/center-hours/use-center-hours';
import { useCenterHoursOverridesInRange } from '../../hooks/center-hours-overrides/use-center-hours-overrides-in-range';
import { useTeachers } from '../../hooks/teacher/use-teachers';
import { useFeature } from '../../hooks/use-feature';
import { useTodayIsoDate } from '../../hooks/use-today-iso-date';
import { localizedName } from '../../lib/teachers/localized-name';
import { resolvePersistedWeek } from '../../lib/center-hours';
import {
  deriveClosedSegmentsByDay,
  deriveOverrideAwareRange,
  weekColumnDates,
  weekDateSpan,
} from '../../lib/center-hours-overrides/planner-closures';
import { PlannerToolbar } from '../../components/planning/planner-toolbar';
import { PlannerGrid } from '../../components/planning/planner-grid';
import { PlannerGridSkeleton } from '../../components/planning/planner-grid-skeleton';
import { SessionTemplateDialog } from '../../components/planning/session-template-dialog';
import { CreateSessionDialog } from '../../components/planning/create-session-dialog';
import { ScheduleExportDialog } from '../../components/planning/schedule-export-dialog';
import { SessionGeneratorDialog } from '../../components/planning/session-generator-dialog';
import { ScheduleAuditDialog } from '../../components/schedule-audit/schedule-audit-dialog';
import type { PlannerSessionView } from '../../lib/planning/planner-view';
import {
  applyFilters,
  byLabel,
  deriveRoomLevelOptions,
  NO_FILTERS,
  type FilterOptions,
  type PlannerFilters,
} from '../../lib/planning/filters';

/** Full-width error panel for a failed planner query, with a retry action. */
function PlannerLoadError({
  title,
  description,
  retryLabel,
  onRetry,
}: {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <ErrorState
      icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
      title={title}
      description={description}
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      }
    />
  );
}

/**
 * Weekly planner: a 7-column × time-slot grid of the center's recurring
 * sessions, colour-coded by subject, filterable by teacher / room / level (and
 * exam-prep kind on Pro+). Clicking a block opens its session template. Runs
 * against the mock gateway until the `session.week` read model is enriched.
 */
export function PlannerPage() {
  const { t, i18n } = useTranslation();
  const canGenerate = useFeature('planning.custom-grid') || useFeature('planning.random-auto');
  const canAudit = useFeature('settings.center-hours');
  const query = useWeekSessions();
  // The teacher filter reads the live *active* roster (SOU-118 / SOU-37), so an
  // archived teacher drops from the picker even while their past sessions render.
  const teachersQuery = useTeachers('active', '');
  const [filters, setFilters] = useState<PlannerFilters>(NO_FILTERS);
  const [selected, setSelected] = useState<PlannerSessionView | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const hoursQuery = useCenterHours();
  // Dated overrides (Ramadan, a holiday week) are resolved PER COLUMN against each
  // visible day's own civil date, so a boundary week grays out only the days the
  // override actually covers (SOU-165). The failure is soft — the planner falls
  // back to the base weekly hours rather than blocking the grid. `today` advances
  // across midnight so an overnight-mounted planner doesn't pin yesterday's week.
  const today = useTodayIsoDate();
  const weekDates = useMemo(() => weekColumnDates(today), [today]);
  const span = useMemo(() => weekDateSpan(weekDates), [weekDates]);
  const overridesQuery = useCenterHoursOverridesInRange(span.start, span.end);
  const overrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data]);
  const week = useMemo(() => query.data ?? [], [query.data]);
  // A fresh center persists no hours rows (an empty array, never undefined), so
  // fall back to the domain's seed week (09:00–18:00) and agree with the
  // Settings form instead of a hard-coded window (SOU-184).
  const hoursWeek = resolvePersistedWeek(hoursQuery.data?.week);
  const range = useMemo(
    () => deriveOverrideAwareRange(hoursWeek, overrides, weekDates),
    [hoursWeek, overrides, weekDates],
  );
  const closedSegmentsByDay = useMemo(
    () => deriveClosedSegmentsByDay(hoursWeek, overrides, weekDates, range),
    [hoursWeek, overrides, weekDates, range],
  );
  const filtered = useMemo(() => applyFilters(week, filters), [week, filters]);

  const locale = i18n.language;
  const options = useMemo<FilterOptions>(() => {
    const { rooms, levels } = deriveRoomLevelOptions(week, t('planning.filters.unknownRoom'));
    const teachers = (teachersQuery.data ?? [])
      .map((teacher) => ({ value: teacher.id, label: localizedName(teacher, locale) }))
      .sort(byLabel);
    return { teachers, rooms, levels };
  }, [week, teachersQuery.data, locale, t]);

  const patchFilters = (patch: Partial<PlannerFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <section
      aria-labelledby="planning-title"
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-5 overflow-hidden"
    >
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="planning-title" className="text-xl font-semibold text-foreground">
            {t('planning.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('planning.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ScheduleExportDialog />
          {canGenerate ? (
            <Button variant="secondary" onClick={() => setGenerating(true)}>
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              {t('planning.generator.trigger')}
            </Button>
          ) : null}
          {canAudit ? <ScheduleAuditDialog /> : null}
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('planning.form.new')}
          </Button>
        </div>
      </header>

      {hoursQuery.isError ? (
        <PlannerLoadError
          title={t('planning.hoursError.title')}
          description={t('planning.hoursError.body')}
          retryLabel={t('planning.loadError.retry')}
          onRetry={() => void hoursQuery.refetch()}
        />
      ) : query.isPending || hoursQuery.isPending ? (
        <PlannerGridSkeleton className="min-h-0 flex-1" />
      ) : query.isError ? (
        <PlannerLoadError
          title={t('planning.loadError.title')}
          description={t('planning.loadError.body')}
          retryLabel={t('planning.loadError.retry')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <PlannerToolbar
            filters={filters}
            options={options}
            onChange={patchFilters}
            onReset={() => setFilters(NO_FILTERS)}
          />
          <PlannerGrid
            className="min-h-0 flex-1"
            sessions={filtered}
            range={range}
            closedSegmentsByDay={closedSegmentsByDay}
            onSelect={setSelected}
            emptyLabel={week.length === 0 ? t('planning.empty.week') : t('planning.empty.noMatch')}
          />
        </>
      )}

      <SessionTemplateDialog session={selected} onOpenChange={(open) => !open && setSelected(null)} />
      <CreateSessionDialog open={creating} onOpenChange={setCreating} />
      <SessionGeneratorDialog open={generating} onOpenChange={setGenerating} />
    </section>
  );
}
