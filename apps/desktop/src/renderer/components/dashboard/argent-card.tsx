import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@centresoutien/ui';
import { formatMadParts, formatMonthName, formatSignedMad, formatSignedPercent } from '../../lib/format';
import { previousMonth } from '../../lib/subscriptions/subscription-month';

export type ArgentDelta =
  | { kind: 'percent'; value: number | null }
  | { kind: 'amount'; value: number };

type ArgentCardProps = {
  label: string;
  amountMad: number;
  /** `undefined` or a `null` percent hides the delta line (no previous-month baseline). */
  delta?: ArgentDelta | undefined;
  /** `true` → a rising delta is good (green); `false` → rising is bad (red). */
  upIsGood: boolean;
  /** The billed month, `YYYY-MM` — the delta references the previous month. */
  month: string;
  /** `warning` colors the figure amber — used for Impayé (design 1b). */
  tone?: 'default' | 'warning';
};

function deltaLine(
  delta: ArgentDelta,
  upIsGood: boolean,
  locale: string,
  vsLabel: string,
): ReactNode | null {
  if (delta.kind === 'percent') {
    if (delta.value === null) return null;
    const positive = delta.value >= 0;
    return (
      <p
        className={cn(
          'mt-1 text-[11.5px] font-semibold',
          positive === upIsGood ? 'text-success' : 'text-destructive',
        )}
      >
        <span dir="ltr">
          {positive ? '▲' : '▼'} {formatSignedPercent(delta.value, locale)}
        </span>{' '}
        {vsLabel}
      </p>
    );
  }
  const positive = delta.value >= 0;
  return (
    <p
      className={cn(
        'mt-1 text-[11.5px] font-semibold',
        positive === upIsGood ? 'text-success' : 'text-destructive',
      )}
    >
      <span dir="ltr">
        {positive ? '▲' : '▼'} {formatSignedMad(delta.value, locale)}
      </span>{' '}
      {vsLabel}
    </p>
  );
}

/** One Basique Argent money card (design 1b): label, big mono figure, optional delta line. */
export function ArgentCard({ label, amountMad, delta, upIsGood, month, tone = 'default' }: ArgentCardProps) {
  const { t, i18n } = useTranslation();
  const { amount, unit } = formatMadParts(amountMad, i18n.language);
  const vsLabel = t('dashboard.basic.argent.deltaVs', {
    month: formatMonthName(previousMonth(month), i18n.language),
  });
  const line = delta ? deltaLine(delta, upIsGood, i18n.language, vsLabel) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-2xl font-semibold tabular-nums',
          tone === 'warning' ? 'text-warning' : 'text-foreground',
        )}
      >
        <span dir="ltr">
          {amount} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
        </span>
      </p>
      {line}
    </div>
  );
}
