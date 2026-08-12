import { useTranslation } from 'react-i18next';
import { TooltipProvider } from '@centresoutien/ui';
import { bcp47, formatMonthShort } from '../../lib/format';
import {
  buildHeatmapColumns,
  HEATMAP_ROWS,
  type HeatmapColumn,
} from '../../lib/dashboard/attendance-heatmap-layout';
import { AttendanceHeatmapCell } from './attendance-heatmap-cell';
import { AttendanceHeatmapLegend } from './attendance-heatmap-legend';
import type { AttendanceHeatmapCellView } from '../../lib/dashboard/dashboard-view';

const LABELLED_ROWS = new Set([0, 2, 4]); // Monday / Wednesday / Friday, GitHub-style
const LABEL_GUTTER = 'w-9 shrink-0';

/**
 * Narrow weekday initials Monday→Sunday; only Mon/Wed/Fri are shown, the rest
 * blank. Narrow (single glyph) keeps the label gutter compact and, unlike the
 * CLDR `short` form, fits in AR where abbreviated weekdays are full-length words.
 */
function buildWeekdayLabels(locale: string): readonly string[] {
  const formatter = new Intl.DateTimeFormat(bcp47(locale), { weekday: 'narrow' });
  return Array.from({ length: HEATMAP_ROWS }, (_row, row) =>
    LABELLED_ROWS.has(row) ? formatter.format(new Date(2024, 0, 1 + row)) : '',
  );
}

/** One short month label per column, only where the month changes (or the first column). */
function buildMonthLabels(columns: readonly HeatmapColumn[], locale: string): readonly (string | null)[] {
  let previousKey = '';
  return columns.map((column) => {
    const year = column.weekStart.getFullYear();
    const month = column.weekStart.getMonth();
    const key = `${year}-${month}`;
    if (key === previousKey) return null;
    previousKey = key;
    return formatMonthShort(`${year}-${String(month + 1).padStart(2, '0')}`, locale);
  });
}

/**
 * Avancé widget: a GitHub-contribution-style attendance calendar over the trend
 * window — columns are calendar weeks, rows are weekdays. Unlike the timeline
 * charts it is **not** wrapped `dir="ltr"`: it inherits the page direction so
 * weeks flow right→left in AR, with the weekday gutter and month labels mirrored
 * to the start side. Cells are keyboard-focusable with full aria labels.
 */
export function AttendanceHeatmap({ cells }: { cells: readonly AttendanceHeatmapCellView[] }) {
  const { t, i18n } = useTranslation();
  const columns = buildHeatmapColumns(cells);

  if (columns.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground">
        {t('dashboard.advanced.widgets.attendanceHeatmap.empty')}
      </p>
    );
  }

  const weekdayLabels = buildWeekdayLabels(i18n.language);
  const monthLabels = buildMonthLabels(columns, i18n.language);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1">
            <div className={LABEL_GUTTER} aria-hidden="true" />
            <div className="flex gap-[3px]">
              {monthLabels.map((label, column) => (
                <div
                  key={columns[column]?.weekStart.getTime() ?? column}
                  className="w-3 overflow-visible whitespace-nowrap text-start text-[10px] text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-1">
            <div className={`flex flex-col gap-[3px] ${LABEL_GUTTER}`} aria-hidden="true">
              {weekdayLabels.map((label, row) => (
                <span
                  key={row}
                  className="flex h-3 items-center whitespace-nowrap pe-1 text-[10px] text-muted-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
            <TooltipProvider delayDuration={80}>
              <div
                role="group"
                aria-label={t('dashboard.advanced.widgets.attendanceHeatmap.gridLabel')}
                className="flex gap-[3px]"
              >
                {columns.map((column) => (
                  <div key={column.weekStart.getTime()} className="flex flex-col gap-[3px]">
                    {column.cells.map((cell, row) => (
                      <AttendanceHeatmapCell key={cell?.date ?? `pad-${row}`} cell={cell} />
                    ))}
                  </div>
                ))}
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>
      <AttendanceHeatmapLegend />
    </div>
  );
}
