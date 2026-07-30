import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@centresoutien/ui';

type ParentListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
};

/** Search box for the parents list (matches name or phone). */
export function ParentListToolbar({ search, onSearchChange }: ParentListToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={t('parents.search')}
        aria-label={t('parents.searchLabel')}
        className="ps-9"
      />
    </div>
  );
}
