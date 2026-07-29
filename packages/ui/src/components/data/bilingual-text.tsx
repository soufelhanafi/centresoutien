import { cn } from '@ui/lib/utils';

export type BilingualTextProps = {
  value: string;
  /** `arabic` forces RTL and the Arabic face, even on an LTR page. */
  script: 'latin' | 'arabic';
  className?: string;
};

/**
 * Renders one side of a bilingual field. The design shows `Nom (FR)` beside
 * `الاسم (AR)` in the same LTR table, so the Arabic cell needs its own
 * direction and font rather than inheriting the page's.
 */
export function BilingualText({ value, script, className }: BilingualTextProps) {
  if (script === 'arabic') {
    return (
      <span dir="rtl" className={cn('font-arabic', className)}>
        {value}
      </span>
    );
  }
  return <span className={className}>{value}</span>;
}
