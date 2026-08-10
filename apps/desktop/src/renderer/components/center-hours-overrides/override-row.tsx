import { useTranslation } from 'react-i18next';
import { CalendarRange } from 'lucide-react';
import { WEEKDAYS } from '@centresoutien/domain';
import { formatTimeRange } from '../../lib/planning/time-range';
import { formatIsoDate } from '../../lib/center-hours-overrides/dates';
import type { CenterHoursOverrideView } from '../../lib/center-hours-overrides/override-view';

/**
 * One saved override: its date range and, per weekday, the open windows (a
 * mid-day gap reads as two ranges) or "Fermé". Read-only — the manager creates
 * overrides; editing an active period is a new override. Weekday labels reuse
 * the shared `centerHours.weekdays` keys; times format through `Intl` per locale.
 */
export function OverrideRow({ override }: { override: CenterHoursOverrideView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span dir="ltr">
          {formatIsoDate(override.dateRange.start, locale)} –{' '}
          {formatIsoDate(override.dateRange.end, locale)}
        </span>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {WEEKDAYS.map((day) => {
          const windows = override.hoursByWeekday[day] ?? [];
          return (
            <div key={day} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{t(`centerHours.weekdays.${day}`)}</dt>
              <dd className="text-end font-medium tabular-nums text-foreground" dir="ltr">
                {windows.length === 0
                  ? t('centerHours.closed')
                  : windows
                      .map((window) => formatTimeRange(window.open, window.close, locale))
                      .join(' · ')}
              </dd>
            </div>
          );
        })}
      </dl>
    </li>
  );
}
