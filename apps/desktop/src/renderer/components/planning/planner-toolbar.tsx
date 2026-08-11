import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, RotateCcw } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import {
  ALL,
  hasActiveFilters,
  type FilterOptions,
  type KindFilter,
  type PlannerFilters,
} from '../../lib/planning/filters';
import { AllSessionsDrawer } from './all-sessions-drawer';

type PlannerToolbarProps = {
  filters: PlannerFilters;
  options: FilterOptions;
  onChange: (patch: Partial<PlannerFilters>) => void;
  onReset: () => void;
};

/** Selects `id` back to `''` (our "all" value) or the picked option. */
function pick(value: string): string {
  return value === ALL ? '' : value;
}

/** Teacher / room / level (+ exam-prep kind) filters above the planner grid. */
export function PlannerToolbar({ filters, options, onChange, onReset }: PlannerToolbarProps) {
  const { t } = useTranslation();
  const examPrepEnabled = useFeature('core.exam-prep');
  const [allSessionsOpen, setAllSessionsOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.teacherId === '' ? ALL : filters.teacherId}
        onValueChange={(v) => onChange({ teacherId: pick(v) })}
      >
        <SelectTrigger className="w-44" aria-label={t('planning.filters.teacher')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('planning.filters.teacherAll')}</SelectItem>
          {options.teachers.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.roomId === '' ? ALL : filters.roomId}
        onValueChange={(v) => onChange({ roomId: pick(v) })}
      >
        <SelectTrigger className="w-40" aria-label={t('planning.filters.room')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('planning.filters.roomAll')}</SelectItem>
          {options.rooms.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.level === '' ? ALL : filters.level}
        onValueChange={(v) => onChange({ level: pick(v) })}
      >
        <SelectTrigger className="w-40" aria-label={t('planning.filters.level')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('planning.filters.levelAll')}</SelectItem>
          {options.levels.map((lvl) => (
            <SelectItem key={lvl} value={lvl}>
              {lvl}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {examPrepEnabled ? (
        <Select value={filters.kind} onValueChange={(v) => onChange({ kind: v as KindFilter })}>
          <SelectTrigger className="w-40" aria-label={t('planning.filters.kind')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('planning.filters.kindAll')}</SelectItem>
            <SelectItem value="regular">{t('planning.kind.regular')}</SelectItem>
            <SelectItem value="exam-prep">{t('planning.kind.examPrep')}</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      {hasActiveFilters(filters) ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('planning.filters.reset')}
        </Button>
      ) : null}

      <Button type="button" variant="outline" onClick={() => setAllSessionsOpen(true)}>
        <CalendarRange className="me-2 h-4 w-4" aria-hidden="true" />
        {t('planning.allSessions.open')}
      </Button>
      <AllSessionsDrawer open={allSessionsOpen} onOpenChange={setAllSessionsOpen} />
    </div>
  );
}
