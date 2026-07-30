import type { CSSProperties } from 'react';
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// This is an Electron app, not Next.js — no `next-themes`. The active theme
// is a plain prop the caller controls (defaults to 'system', matching sonner's
// own default), keeping this package i18n/framework-agnostic (SOU-16).
export function Toaster({ theme = 'system', ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      // A modal Radix layer (Sheet/Dialog) sets `pointer-events: none` on
      // <body>, which the portaled toast inherits — making toast actions (e.g.
      // an "undo") unclickable while a sheet is open. Sonner never re-enables
      // it, so force each visible toast back to `auto`. Toasts must stay
      // interactive above modals.
      toastOptions={{ className: 'pointer-events-auto' }}
      icons={{
        success: <CircleCheck className="size-4" aria-hidden="true" />,
        info: <Info className="size-4" aria-hidden="true" />,
        warning: <TriangleAlert className="size-4" aria-hidden="true" />,
        error: <OctagonX className="size-4" aria-hidden="true" />,
        loading: <Loader2 className="size-4 animate-spin" aria-hidden="true" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      {...props}
    />
  );
}
