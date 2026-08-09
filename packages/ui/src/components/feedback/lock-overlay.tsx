import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@ui/lib/utils';

export type LockOverlayProps = {
  /** Name of the locked feature — translated by the caller. */
  title: string;
  description?: string;
  ctaLabel?: string;
  /** Explicit `undefined` is allowed so callers can compute a handler that may be absent. */
  onCta?: (() => void) | undefined;
  /** The real UI, rendered blurred behind the scrim. */
  children: ReactNode;
  className?: string;
};

/**
 * The single plan-lock treatment ("un seul traitement", design 1a): the real
 * content sits blurred and dimmed behind a scrim carrying a lock card.
 * Presentational only — the caller decides whether a feature is locked.
 */
export function LockOverlay({
  title,
  description,
  ctaLabel = 'Voir les plans',
  onCta,
  children,
  className,
}: LockOverlayProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border', className)}>
      {/*
        Decorative preview: hidden from AT so the lock message is what's announced.
        `inert` (React 19 / @types/react 19 supports it as a real boolean prop) is what
        actually does the work — it strips the subtree from the tab order, hit-testing,
        and the accessibility tree, so interactive children (buttons, links, form
        fields) can never be tabbed into while locked. `aria-hidden` is kept alongside
        it for defence in depth on top of `inert`.
      */}
      <div className="pointer-events-none opacity-35 blur-[1px]" aria-hidden="true" inert>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--lock-scrim)] backdrop-blur-[1px]">
        <div className="rounded-lg border border-border bg-background p-4 text-center shadow-overlay">
          <Lock className="mx-auto h-4 w-4 text-primary" aria-hidden="true" />
          <p className="mt-1 text-[12.5px] font-bold text-foreground">{title}</p>
          {description ? (
            <p className="mb-2 mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>
          ) : null}
          {onCta ? (
            <button
              type="button"
              onClick={onCta}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ctaLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
