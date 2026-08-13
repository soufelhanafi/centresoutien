import { useTranslation } from 'react-i18next';
import { Outlet } from '@tanstack/react-router';
import { ScrollArea } from '@centresoutien/ui';
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
          tabIndex={-1}
          className="flex min-h-0 flex-1 focus:outline-none print:block"
        >
          <ScrollArea className="h-full w-full" contentClassName="p-6 print:p-0">
            {/* The skip-link target must sit INSIDE the scroll viewport so the
                browser's keyboard scrolling (nearest scrollable ancestor) lands
                on the overlay viewport, not the overflow-locked <main> (SOU-216
                regression guard). */}
            <div id="main-content" tabIndex={-1} className="h-full focus:outline-none">
              <Outlet />
            </div>
          </ScrollArea>
        </main>
      </div>
      <CommandPalette />
      <UpgradeDialog />
    </div>
  );
}
