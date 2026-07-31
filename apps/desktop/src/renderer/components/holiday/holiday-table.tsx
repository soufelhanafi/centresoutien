import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { HolidayStatus, HolidayView } from '../../lib/holidays/holiday-view';
import { HolidayRow } from './holiday-row';

const COLUMNS = ['1.8fr', '0.9fr', '1.2fr', '0.9fr', '96px'] as const;

/** The holidays list as an accessible grid-styled table (design geometry). */
export function HolidayTable({
  holidays,
  variant,
}: {
  holidays: readonly HolidayView[];
  variant: HolidayStatus;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('holidays.table.name')}</DataTableHead>
            <DataTableHead>{t('holidays.table.kind')}</DataTableHead>
            <DataTableHead>{t('holidays.table.dates')}</DataTableHead>
            <DataTableHead>{t('holidays.table.state')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('holidays.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {holidays.map((holiday) => (
            <HolidayRow key={holiday.id} holiday={holiday} variant={variant} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
