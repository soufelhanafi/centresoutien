import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@ui/lib/utils';

// Semantic roles and geometry come from design screen 1a. Status pills carry a
// 6px dot; kind chips are rounded and dotless.
const badgeVariants = cva('inline-flex items-center gap-1.5 border text-xs font-semibold', {
  variants: {
    variant: {
      success: 'bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)] border-[var(--badge-success-border)]',
      warning: 'bg-[var(--badge-warning-bg)] text-[var(--badge-warning-fg)] border-[var(--badge-warning-border)]',
      info: 'bg-[var(--badge-info-bg)] text-[var(--badge-info-fg)] border-[var(--badge-info-border)]',
      destructive:
        'bg-[var(--badge-destructive-bg)] text-[var(--badge-destructive-fg)] border-[var(--badge-destructive-border)]',
      neutral: 'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)] border-[var(--badge-neutral-border)]',
    },
    shape: {
      pill: 'rounded-full px-2.5 py-1',
      rounded: 'rounded-sm px-2.5 py-1',
    },
  },
  defaultVariants: { variant: 'neutral', shape: 'pill' },
});

const dotColors: Record<NonNullable<BadgeProps['variant']>, string> = {
  success: 'bg-[var(--badge-success-dot)]',
  warning: 'bg-[var(--badge-warning-dot)]',
  info: 'bg-[var(--badge-info-dot)]',
  destructive: 'bg-[var(--badge-destructive-dot)]',
  neutral: 'bg-[var(--badge-neutral-dot)]',
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    /** Render the 6px status dot. Status pills use it; kind chips do not. */
    dot?: boolean;
  };

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, shape, dot = false, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, shape }), className)} {...props}>
      {dot ? (
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant ?? 'neutral'])} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  ),
);
Badge.displayName = 'Badge';

export { badgeVariants };
