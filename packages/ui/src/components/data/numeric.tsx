import type { ReactNode } from 'react';
import { cn } from '@ui/lib/utils';

export type NumericProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Amounts, counters and tabular dates. Design 1a: JetBrains Mono, tabular
 * figures, "toujours aligné à droite dans les tableaux, LTR comme RTL" — so
 * `dir="ltr"` is forced even inside an Arabic page, keeping digit order and
 * the currency suffix stable.
 */
export function Numeric({ children, className }: NumericProps) {
  return (
    <span dir="ltr" className={cn('font-mono text-xs tabular-nums text-end', className)}>
      {children}
    </span>
  );
}
