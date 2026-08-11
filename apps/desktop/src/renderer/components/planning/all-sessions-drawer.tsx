import { useTranslation } from 'react-i18next';
import { WEEKDAYS, type WeekdayIndex } from '@centresoutien/domain';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@centresoutien/ui';
import { useWeekSessions } from '../../hooks/planning/use-week-sessions';
import { AllSessionsRow } from './all-sessions-row';
import type { PlannerSessionView } from '../../lib/planning/planner-view';

function groupByWeekday(
  sessions: readonly PlannerSessionView[],
): ReadonlyArray<{ day: WeekdayIndex; rows: readonly PlannerSessionView[] }> {
  return WEEKDAYS.map((day) => ({
    day,
    rows: sessions
      .filter((session) => session.dayOfWeek === day)
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start)),
  })).filter((group) => group.rows.length > 0);
}

export function AllSessionsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useWeekSessions();
  const groups = groupByWeekday(data ?? []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('planning.allSessions.title')}</SheetTitle>
          <SheetDescription>{t('planning.allSessions.regenNote')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p role="alert" className="py-8 text-center text-sm text-destructive">
            {t('planning.allSessions.loadError')}
          </p>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('planning.allSessions.empty')}
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.day} className="space-y-2">
                <h3 className="text-sm font-semibold">{t(`planning.weekdays.${group.day}`)}</h3>
                <ul className="space-y-2">
                  {group.rows.map((session) => (
                    <AllSessionsRow key={session.id} session={session} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
