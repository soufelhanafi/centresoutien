import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeft } from 'lucide-react';
import { cn } from '@centresoutien/ui';
import { NAV_MODULES } from '../../app/nav-items';
import { NavItem } from './nav-item';
import { PlanSwitcher } from '../plan-switcher';

/**
 * Primary navigation rail. Owns its own collapse state (only this component
 * needs it) and sets its own width, so no layout state is drilled through the
 * shell. Sits before <main> in the DOM; under `dir="rtl"` the flex row in
 * AppShell places it on the trailing side automatically.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      aria-label={t('shell.navAriaLabel')}
      className={cn(
        'flex h-screen flex-col border-e border-border bg-card transition-[width] duration-200 print:hidden',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
          aria-hidden="true"
        >
          CS
        </span>
        <span className={cn('truncate text-sm font-semibold text-foreground', collapsed && 'sr-only')}>
          {t('app.title')}
        </span>
      </div>

      <ul className="nav-scroll flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {NAV_MODULES.map((module) => (
          <li key={module.id}>
            <NavItem module={module} collapsed={collapsed} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-border p-2">
        {!collapsed && import.meta.env.DEV ? <PlanSwitcher /> : null}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center',
          )}
        >
          <PanelLeft className="h-[18px] w-[18px] shrink-0 rtl:-scale-x-100" aria-hidden="true" />
          <span className={cn(collapsed && 'sr-only')}>{t('shell.collapse')}</span>
        </button>
      </div>
    </nav>
  );
}
