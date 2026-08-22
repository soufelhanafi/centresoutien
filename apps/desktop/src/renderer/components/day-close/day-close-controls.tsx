import { useTranslation } from 'react-i18next';
import { Download, Printer } from 'lucide-react';
import { Button, Input, Label } from '@centresoutien/ui';
import type { DayCloseActions, DayCloseDateSelection } from './day-close-section.types';

/**
 * The day-close controls: a business-day picker (capped at today, `dir="ltr"` so the
 * native date field keeps its layout in both locales) plus Exporter / Imprimer. The
 * PDF actions are enabled once a report has loaded — including a zero-activity day,
 * which is a valid closure document — and disabled only while loading or a job runs.
 */
export function DayCloseControls({
  date,
  actions,
  canProduce,
}: {
  date: DayCloseDateSelection;
  actions: DayCloseActions;
  canProduce: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="day-close-day">{t('payments.dayClose.dayLabel')}</Label>
        <Input
          id="day-close-day"
          type="date"
          dir="ltr"
          value={date.day}
          max={date.maxDay}
          onChange={(event) => date.onChange(event.target.value)}
        />
      </div>

      <Button
        variant="outline"
        onClick={actions.onExport}
        disabled={!canProduce || actions.isExporting}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {t('payments.dayClose.export')}
      </Button>
      <Button
        variant="outline"
        onClick={actions.onPrint}
        disabled={!canProduce || actions.isPrinting}
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
        {t('payments.dayClose.print')}
      </Button>
    </div>
  );
}
