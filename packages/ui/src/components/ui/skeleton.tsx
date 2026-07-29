import * as React from 'react';
import { cn } from '@ui/lib/utils';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Leading rows use `strong`; trailing rows fade with `faint` (design 1a). */
  tone?: 'strong' | 'faint';
};

export function Skeleton({ className, tone = 'strong', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-sm motion-safe:animate-pulse',
        tone === 'strong' ? 'bg-muted' : 'bg-surface-subtle',
        className,
      )}
      {...props}
    />
  );
}
