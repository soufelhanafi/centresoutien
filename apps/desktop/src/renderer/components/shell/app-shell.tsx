import { useTranslation } from 'react-i18next';
import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './sidebar';
import { AppHeader } from './app-header';
import { DemoBanner } from './demo-banner';
import { CommandPalette } from '../search/command-palette';
import { UpgradeDialog } from '../upgrade/upgrade-dialog';

/**
 * The application chrome every feature screen mounts into: a navigation rail,
 * a header, and the routed content outlet. A plain flex row — under `dir="rtl"`
 * the rail moves to the trailing side with no directional overrides. The demo
 * banner (SOU-110) sits at the top of the content column and renders only in
 * the demo center.
 */
export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-subtle text-foreground print:h-auto print:w-auto print:overflow-visible">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:start-4 focus:top-3 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        {t('shell.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <DemoBanner />
        <AppHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-6 focus:outline-none print:overflow-visible print:p-0"
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <UpgradeDialog />
    </div>
  );
}
