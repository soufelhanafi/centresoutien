import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@centresoutien/ui';

const ALL = '__all__';

type StudentListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  level: string;
  onLevelChange: (value: string) => void;
  levels: readonly string[];
};

/** Search box + level filter + (disabled) group filter shell. */
export function StudentListToolbar({
  search,
  onSearchChange,
  level,
  onLevelChange,
  levels,
}: StudentListToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('students.search')}
          aria-label={t('students.searchLabel')}
          className="ps-9"
        />
      </div>

      <Select value={level === '' ? ALL : level} onValueChange={(v) => onLevelChange(v === ALL ? '' : v)}>
        <SelectTrigger className="sm:w-48" aria-label={t('students.filters.levelLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('students.filters.levelAll')}</SelectItem>
          {levels.map((lvl) => (
            <SelectItem key={lvl} value={lvl}>
              {lvl}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="sm:w-48">
            <Select disabled value={ALL}>
              <SelectTrigger className="w-full" aria-label={t('students.filters.groupLabel')}>
                <SelectValue placeholder={t('students.filters.groupAll')} />
              </SelectTrigger>
            </Select>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('students.filters.groupComingSoon')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
