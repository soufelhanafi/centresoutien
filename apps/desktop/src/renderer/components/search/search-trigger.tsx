import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useCommandPaletteStore } from '../../stores/command-palette-store';

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
}

/**
 * Header entry point for the global command palette (SOU-43) — an input-shaped
 * button so a low-tech director sees "search" even without knowing the Ctrl/Cmd+K
 * shortcut. Opening/closing is owned by {@link CommandPalette}; this only flips
 * the shared open state. Logical properties keep it correct under RTL.
 */
export function SearchTrigger() {
  const { t } = useTranslation();
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const shortcut = isMacPlatform() ? '⌘K' : 'Ctrl K';

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background ps-3 pe-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{t('search.trigger')}</span>
      <kbd className="ms-auto hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs md:inline">
        {shortcut}
      </kbd>
    </button>
  );
}
