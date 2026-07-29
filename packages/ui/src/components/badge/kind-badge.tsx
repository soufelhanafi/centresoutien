import { Badge } from '@ui/components/ui/badge';
import { cn } from '@ui/lib/utils';

/** Regular vs exam-prep track. CLAUDE.md §7 requires these stay separable. */
export type SessionKindTone = 'regular' | 'exam-prep';

export type KindBadgeProps = {
  kind: SessionKindTone;
  /** Translated label — `packages/ui` holds no i18n. */
  label: string;
  className?: string;
};

// Exam-prep uses a dashed purple border (design 1a) so the track is
// distinguishable at a glance and without relying on colour alone. These
// classes fully replace Badge's neutral-variant colours (same twMerge
// groups: background-color, text-color, border-color), so no separate
// neutraliser is needed here — unlike PlanBadge, which drops the border.
const kindStyles: Record<SessionKindTone, string> = {
  regular: 'bg-[var(--kind-regular-bg)] text-[var(--kind-regular-fg)] border-[var(--kind-regular-border)]',
  'exam-prep':
    'bg-[var(--kind-exam-bg)] text-[var(--kind-exam-fg)] border-[var(--kind-exam-border)] border-dashed font-bold',
};

export function KindBadge({ kind, label, className }: KindBadgeProps) {
  return (
    <Badge shape="rounded" className={cn(kindStyles[kind], className)}>
      {label}
    </Badge>
  );
}
