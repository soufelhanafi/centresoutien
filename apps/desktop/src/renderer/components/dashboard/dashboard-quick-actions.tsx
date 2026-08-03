import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { UserPlus, Wallet, CalendarPlus } from 'lucide-react';
import { studentsModule, invoicingModule, planningModule } from '../../app/nav-items';

const ACTIONS = [
  { module: studentsModule, icon: UserPlus, labelKey: 'dashboard.basic.quickActions.addStudent' },
  { module: invoicingModule, icon: Wallet, labelKey: 'dashboard.basic.quickActions.recordPayment' },
  { module: planningModule, icon: CalendarPlus, labelKey: 'dashboard.basic.quickActions.addSession' },
] as const;

/** Basique dashboard shortcuts (SOU-100 KICKOFF) to the three existing routes an admin reaches for daily tasks. */
export function DashboardQuickActions() {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('dashboard.basic.quickActions.title')} className="flex flex-wrap gap-2.5">
      {ACTIONS.map(({ module, icon: Icon, labelKey }) => (
        <Link
          key={module.id}
          to={module.path}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
