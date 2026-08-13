import { useRef, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from '@tanstack/react-router';
import { ScrollArea, type ScrollAreaRef } from '@centresoutien/ui';
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
  const scrollRef = useRef<ScrollAreaRef>(null);

  // The skip link targets the scroll viewport, not the overflow-hidden <main>
  // wrapper, so keyboard scrolling (PageDown/arrows) works immediately after
  // "skip to content" (SOU-216 regression guard).
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollRef.current?.osInstance()?.elements().viewport.focus();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-subtle text-foreground print:h-auto print:w-auto print:overflow-visible">
      <a
        href="#main-content"
        onClick={skipToContent}
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
          className="flex min-h-0 flex-1 focus:outline-none print:block"
        >
          <ScrollArea ref={scrollRef} className="h-full w-full" contentClassName="p-6 print:p-0">
            <Outlet />
          </ScrollArea>
        </main>
      </div>
      <CommandPalette />
      <UpgradeDialog />
    </div>
  );
}
