import type { ReactNode } from 'react';
import { cn } from '@ui/lib/utils';

export type ErrorStateProps = {
  /** Decorative illustration — pass a lucide icon; it is marked aria-hidden. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Typically a retry button, translated and wired by the caller. */
  action?: ReactNode;
  className?: string;
};

/** Error-state card: same layout as EmptyState, destructive tint on the icon tile. */
export function ErrorState({ icon, title, description, action, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-card p-6 text-center',
        className,
      )}
    >
      {icon ? (
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-[11px] bg-destructive/10 text-destructive"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-[300px] text-[12.5px] text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
