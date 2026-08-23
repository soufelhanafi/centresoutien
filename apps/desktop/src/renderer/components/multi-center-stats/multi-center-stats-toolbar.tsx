import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@centresoutien/ui';

/** Text filter on the center name/code — the only filter the ≤20-row table needs. */
export function MultiCenterStatsToolbar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();

  return (
    <div className="relative max-w-xs">
      <label htmlFor={inputId} className="sr-only">
        {t('multiCenterStats.filter.label')}
      </label>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('multiCenterStats.filter.placeholder')}
        className="ps-9"
      />
    </div>
  );
}
