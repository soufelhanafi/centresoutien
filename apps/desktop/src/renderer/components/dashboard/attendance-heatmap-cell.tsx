import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@centresoutien/ui';
import { bcp47, formatDate } from '../../lib/format';
import type { AttendanceHeatmapCellView } from '../../lib/dashboard/dashboard-view';

const CELL_BASE = 'h-3 w-3 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Graded teal on transparent — a light floor keeps a real 0% day distinct from the grey no-data cell. */
function rateFillStyle(ratePercent: number): CSSProperties {
  const mixPercent = 18 + (ratePercent / 100) * 82;
  return { backgroundColor: `color-mix(in srgb, var(--color-primary) ${mixPercent}%, transparent)` };
}

/** One heatmap day: interactive when it carries data, an inert spacer when it pads a partial week. */
export function AttendanceHeatmapCell({ cell }: { cell: AttendanceHeatmapCellView | null }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (cell === null) {
    return <div className="h-3 w-3" aria-hidden="true" />;
  }

  const dateLabel = formatDate(cell.date, locale);
  const numeric = new Intl.NumberFormat(bcp47(locale));
  const isNoData = cell.ratePercent === null && !cell.isHoliday;

  const stateLabel = cell.isHoliday
    ? t('dashboard.advanced.widgets.attendanceHeatmap.holiday')
    : isNoData
      ? t('dashboard.advanced.widgets.attendanceHeatmap.noData')
      : t('dashboard.advanced.widgets.attendanceHeatmap.rate', { percent: numeric.format(cell.ratePercent ?? 0) });

  const visual = cell.isHoliday
    ? 'bg-muted [background-image:repeating-linear-gradient(45deg,transparent,transparent_2px,var(--color-border)_2px,var(--color-border)_3px)]'
    : isNoData
      ? 'bg-muted/50'
      : '';

  return (
    <Tooltip>
      <TooltipTrigger
        className={`${CELL_BASE} ${visual}`}
        style={cell.ratePercent === null ? undefined : rateFillStyle(cell.ratePercent)}
        aria-label={`${dateLabel} — ${stateLabel}`}
      />
      <TooltipContent>
        <p className="font-semibold">{dateLabel}</p>
        <p>{stateLabel}</p>
        {!cell.isHoliday && !isNoData && (
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 tabular-nums">
            <dt>{t('dashboard.advanced.widgets.attendanceHeatmap.status.present')}</dt>
            <dd dir="ltr" className="text-end">{numeric.format(cell.breakdown.present)}</dd>
            <dt>{t('dashboard.advanced.widgets.attendanceHeatmap.status.absent')}</dt>
            <dd dir="ltr" className="text-end">{numeric.format(cell.breakdown.absent)}</dd>
            <dt>{t('dashboard.advanced.widgets.attendanceHeatmap.status.late')}</dt>
            <dd dir="ltr" className="text-end">{numeric.format(cell.breakdown.late)}</dd>
            <dt>{t('dashboard.advanced.widgets.attendanceHeatmap.status.excused')}</dt>
            <dd dir="ltr" className="text-end">{numeric.format(cell.breakdown.excused)}</dd>
          </dl>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
