import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import type { DashboardBasicSummaryView } from '../../lib/dashboard/dashboard-view';
import { planningModule } from '../../app/nav-items';

/** The amber "N groupes sans séance planifiée" card (design 1b) — rows link to the calendar. */
export function GroupsWithoutSessionsCard({
  groups,
}: {
  groups: DashboardBasicSummaryView['seances']['groupsWithoutSessions'];
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className="rounded-xl border border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-warning">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('dashboard.basic.seances.groupsWithoutSessions', { count: groups.length })}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {groups.map((group) => {
          const name = i18n.language === 'ar' ? group.groupName.ar : group.groupName.fr;
          return (
            <li key={group.groupId}>
              <Link
                to={planningModule.path}
                className="flex items-center justify-between rounded-lg border border-[var(--badge-warning-border)] bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <span className="truncate">{name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-warning rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
