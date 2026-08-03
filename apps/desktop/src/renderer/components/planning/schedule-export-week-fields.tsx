import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Input, Label } from '@centresoutien/ui';
import { formatDate } from '../../lib/format';
import type { WeekRange } from '../../lib/planning/week-range';

type ScheduleExportWeekFieldsProps = {
  weekAnchor: string;
  weekRange: WeekRange;
  onWeekAnchorChange: (date: string) => void;
  onShiftWeek: (deltaWeeks: number) => void;
};

/** Anchor-date input + previous/next navigation; the Monday–Sunday range
 *  containing the anchor is computed and shown read-only so the exported week
 *  is unambiguous, matching the `<Input type="date">` pattern already used by
 *  `RollCallSessionPicker`. */
export function ScheduleExportWeekFields({
  weekAnchor,
  weekRange,
  onWeekAnchorChange,
  onShiftWeek,
}: ScheduleExportWeekFieldsProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="space-y-1.5">
      <Label htmlFor="schedule-export-week">{t('planning.export.week.label')}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onShiftWeek(-1)}
          aria-label={t('planning.export.week.previous')}
        >
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
        <Input
          id="schedule-export-week"
          type="date"
          dir="ltr"
          value={weekAnchor}
          onChange={(event) => onWeekAnchorChange(event.target.value)}
          className="w-40"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onShiftWeek(1)}
          aria-label={t('planning.export.week.next')}
        >
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('planning.export.week.range', {
          start: formatDate(weekRange.start, i18n.language),
          end: formatDate(weekRange.end, i18n.language),
        })}
      </p>
    </div>
  );
}
