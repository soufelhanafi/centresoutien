import { useTranslation } from 'react-i18next';
import { WEEKDAYS } from '@centresoutien/domain';
import { Button, cn } from '@centresoutien/ui';

/**
 * A multi-select of weekdays (Sunday-first, the app's canonical `WEEKDAYS`
 * order), rendered as a row of toggle buttons. Controlled: `value` is the set of
 * selected weekday indices, `onChange` receives the next set. Purely
 * presentational — the caller owns the RHF field. Used for both the eligible
 * "weekday pool" (auto mode) and the admin's "picked weekdays" (custom mode).
 */
export function GeneratorWeekdayPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: readonly number[];
  onChange: (next: number[]) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const selected = new Set(value);

  const toggle = (day: number) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {WEEKDAYS.map((day) => {
        const isSelected = selected.has(day);
        return (
          <Button
            key={day}
            type="button"
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
            aria-pressed={isSelected}
            onClick={() => toggle(day)}
            className={cn('min-w-16', isSelected && 'font-semibold')}
          >
            {t(`planning.weekdays.${day}`)}
          </Button>
        );
      })}
    </div>
  );
}
