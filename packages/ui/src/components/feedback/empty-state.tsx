import type { ReactNode } from 'react';
import { cn } from '@ui/lib/utils';

export type EmptyStateProps = {
  /** Decorative illustration — pass a lucide icon; it is marked aria-hidden. */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** Empty-state card from design 1a: tinted icon tile, title, hint, one action. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-card p-6 text-center',
        className,
      )}
    >
      {icon ? (
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-[11px] bg-accent text-primary"
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
