import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { PlanBadge, cn } from '@centresoutien/ui';
import { useOptionalFeature } from '../../hooks/use-feature';
import { minimumPlanFor } from '../../lib/plan/minimum-plan';
import type { NavModule } from '../../app/nav-items';

const BASE =
  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';
const INACTIVE = 'text-muted-foreground hover:bg-secondary hover:text-foreground';
const ACTIVE = 'bg-accent text-accent-foreground font-semibold';

type NavItemProps = {
  module: NavModule;
  collapsed: boolean;
};

/** One sidebar entry: a Link when available, a locked upgrade affordance otherwise,
 *  or nothing at all when the module is `hideWhenLocked` and the plan lacks its
 *  feature (SOU-309). Owns its `<li>` so a hidden entry leaves no gap in the list. */
export function NavItem({ module, collapsed }: NavItemProps) {
  const { t } = useTranslation();
  const label = t(`nav.${module.id}`);
  const Icon = module.icon;
  const hasFeature = useOptionalFeature(module.feature);
  const locked = module.feature !== undefined && !hasFeature;

  if (module.hideWhenLocked && locked) return null;

  const icon = <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />;
  const text = <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>{label}</span>;

  if (locked) {
    return (
      <li>
        <button
          type="button"
          aria-disabled="true"
          aria-label={collapsed ? label : undefined}
          title={collapsed ? label : t('plan.locked')}
          className={cn(BASE, INACTIVE, 'w-full cursor-not-allowed opacity-70', collapsed && 'justify-center')}
        >
          {icon}
          {text}
          {!collapsed && module.feature ? (
            <PlanBadge tier={minimumPlanFor(module.feature)} />
          ) : (
            <Lock className={cn('h-3.5 w-3.5 shrink-0', collapsed && 'hidden')} aria-hidden="true" />
          )}
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={module.path}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        className={cn(BASE, INACTIVE, collapsed && 'justify-center')}
        activeProps={{ className: cn(BASE, ACTIVE, collapsed && 'justify-center') }}
      >
        {icon}
        {text}
      </Link>
    </li>
  );
}
