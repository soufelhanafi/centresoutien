import { Badge } from '@ui/components/ui/badge';
import { cn } from '@ui/lib/utils';

export type PlanTier = 'essentiel' | 'pro' | 'premium';

// Premium is a gradient, so it sets `background-image` rather than a bg-* colour utility.
const tierStyles: Record<PlanTier, string> = {
  essentiel: 'bg-[var(--plan-essentiel-bg)] text-[var(--plan-essentiel-fg)]',
  pro: 'bg-[var(--plan-pro-bg)] text-[var(--plan-pro-fg)]',
  premium: 'bg-[image:var(--plan-premium-bg)] text-[var(--plan-premium-fg)]',
};

const tierNames: Record<PlanTier, string> = {
  essentiel: 'ESSENTIEL',
  pro: 'PRO',
  premium: 'PREMIUM',
};

export type PlanBadgeProps = {
  tier: PlanTier;
  /** Overrides the default tier name when a translated label is needed. */
  label?: string;
  className?: string;
};

export function PlanBadge({ tier, label, className }: PlanBadgeProps) {
  return (
    <Badge
      className={cn(
        // Plan chips have no border in the design — Badge's base class list
        // always includes `border`, so `border-0` clears the width. But
        // twMerge only dedupes within the same utility group, and the
        // neutral variant's `border-[var(--badge-neutral-border)]` /
        // `bg-[var(--badge-neutral-bg)]` are colour utilities, a different
        // group from `border-0` (width) and from premium's
        // `bg-[image:...]` (background-image). `border-transparent` and
        // `bg-transparent` explicitly neutralise those colour classes so no
        // Badge chrome survives underneath the gradient/solid fill.
        'rounded-[5px] px-2 py-0.5 text-[11px] font-bold tracking-wider border-0 border-transparent bg-transparent',
        tierStyles[tier],
        className,
      )}
    >
      {label ?? tierNames[tier]}
    </Badge>
  );
}
