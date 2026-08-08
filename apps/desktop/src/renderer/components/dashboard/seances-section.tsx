import { useTranslation } from 'react-i18next';
import { cn, Numeric } from '@centresoutien/ui';
import type { DashboardBasicSummaryView } from '../../lib/dashboard/dashboard-view';
import { formatHoursMinutes } from '../../lib/format';
import { GroupsWithoutSessionsCard } from './groups-without-sessions-card';

const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

/** The Séances block (design 1b): big weekly count + planned minutes, then the amber no-sessions card. */
export function SeancesSection({ seances }: { seances: DashboardBasicSummaryView['seances'] }) {
  const { t } = useTranslation();
  const hours = formatHoursMinutes(seances.plannedMinutes);

  return (
    <section aria-labelledby="dashboard-basic-seances" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h2 id="dashboard-basic-seances" className={SECTION_LABEL}>
          {t('dashboard.basic.sections.seances')}
        </h2>
        <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          <Numeric>
            <span dir="ltr">{seances.weekSessionCount}</span>
          </Numeric>{' '}
          <span className={cn('text-xs font-medium text-muted-foreground')}>
            {t('dashboard.basic.seances.planned', { count: seances.weekSessionCount, hours })}
          </span>
        </p>
      </div>
      {seances.groupsWithoutSessions.length > 0 && (
        <GroupsWithoutSessionsCard groups={seances.groupsWithoutSessions} />
      )}
    </section>
  );
}
