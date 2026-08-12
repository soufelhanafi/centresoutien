import { useTranslation } from 'react-i18next';

const SCALE_STOPS = [18, 45, 72, 100] as const;
const SWATCH = 'h-3 w-3 rounded-[3px]';

/** Compact "less → more" ramp plus the holiday and no-data swatches. Order follows page `dir`. */
export function AttendanceHeatmapLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span>{t('dashboard.advanced.widgets.attendanceHeatmap.legend.less')}</span>
        {SCALE_STOPS.map((stop) => (
          <span
            key={stop}
            className={SWATCH}
            style={{ backgroundColor: `color-mix(in srgb, var(--color-primary) ${stop}%, transparent)` }}
          />
        ))}
        <span>{t('dashboard.advanced.widgets.attendanceHeatmap.legend.more')}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className={`${SWATCH} bg-muted/50`} />
        {t('dashboard.advanced.widgets.attendanceHeatmap.noData')}
      </span>
      <span className="flex items-center gap-1">
        <span
          className={`${SWATCH} bg-muted [background-image:repeating-linear-gradient(45deg,transparent,transparent_2px,var(--color-border)_2px,var(--color-border)_3px)]`}
        />
        {t('dashboard.advanced.widgets.attendanceHeatmap.holiday')}
      </span>
    </div>
  );
}
