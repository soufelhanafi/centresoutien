import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@centresoutien/ui';
import type { HolidayYearFilter } from '../../lib/holidays/holiday-years';
import { bcp47 } from '../../lib/format';

/** The `all` sentinel as the Select's string value (Radix Select needs strings). */
const ALL = 'all';

/**
 * Year selector for the holidays list. `all` shows every holiday; a concrete year
 * shows that year's lunar holidays plus every recurring solar holiday. Years use
 * Western digits without grouping in both locales.
 */
export function YearFilter({
  value,
  years,
  onChange,
}: {
  value: HolidayYearFilter;
  years: readonly number[];
  onChange: (value: HolidayYearFilter) => void;
}) {
  const { t, i18n } = useTranslation();
  // Western digits without grouping in both locales — the `-MA` region tag keeps
  // years consistent with the date column (see `format.ts`).
  const yearLabel = new Intl.NumberFormat(bcp47(i18n.language), { useGrouping: false });

  return (
    <Select
      value={value === ALL ? ALL : String(value)}
      onValueChange={(next) => onChange(next === ALL ? ALL : Number(next))}
    >
      <SelectTrigger className="w-44" aria-label={t('holidays.filter.year')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('holidays.filter.allYears')}</SelectItem>
        {years.map((year) => (
          <SelectItem key={year} value={String(year)}>
            {yearLabel.format(year)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
