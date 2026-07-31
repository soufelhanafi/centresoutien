import { useTranslation } from 'react-i18next';
import { Badge, BilingualText, DataTableCell, DataTableRow } from '@centresoutien/ui';
import type { HolidayStatus, HolidayView } from '../../lib/holidays/holiday-view';
import { formatDate } from '../../lib/format';
import { HolidayRowActions } from './holiday-row-actions';

/** A single date, or an inclusive `start – end` range when the holiday spans days. */
function formatRange(holiday: HolidayView, locale: string): string {
  const start = formatDate(holiday.startDate, locale);
  if (holiday.startDate === holiday.endDate) return start;
  return `${start} – ${formatDate(holiday.endDate, locale)}`;
}

/** One holiday row: bilingual name, kind, date range, lifecycle state, actions. */
export function HolidayRow({ holiday, variant }: { holiday: HolidayView; variant: HolidayStatus }) {
  const { t, i18n } = useTranslation();
  const primaryName = i18n.language === 'ar' ? holiday.name.ar : holiday.name.fr;
  const secondaryName = i18n.language === 'ar' ? holiday.name.fr : holiday.name.ar;
  const secondaryScript = i18n.language === 'ar' ? 'latin' : 'arabic';

  return (
    <DataTableRow>
      <DataTableCell>
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{primaryName}</span>
          <BilingualText value={secondaryName} script={secondaryScript} className="text-sm text-muted-foreground" />
        </div>
      </DataTableCell>
      <DataTableCell>
        <Badge variant={holiday.kind === 'lunar' ? 'warning' : 'info'} shape="rounded">
          {t(`holidays.kind.${holiday.kind}`)}
        </Badge>
      </DataTableCell>
      <DataTableCell>
        <span className="text-foreground">{formatRange(holiday, i18n.language)}</span>
      </DataTableCell>
      <DataTableCell>
        {holiday.archived ? (
          <Badge variant="neutral" dot>
            {t('holidays.state.archived')}
          </Badge>
        ) : (
          <Badge variant="success" dot>
            {t('holidays.state.active')}
          </Badge>
        )}
      </DataTableCell>
      <DataTableCell className="text-end">
        <HolidayRowActions holiday={holiday} variant={variant} />
      </DataTableCell>
    </DataTableRow>
  );
}
