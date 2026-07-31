import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import {
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@centresoutien/ui';

const ALL = '__all__';

type TeacherListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
};

/**
 * Search box + (disabled) subject filter shell. The subject filter is inert until
 * the `subject.list` channel exists — it mirrors the students' disabled group
 * filter, so the director sees where filtering by subject will live (SOU-37
 * follow-up).
 */
export function TeacherListToolbar({ search, onSearchChange }: TeacherListToolbarProps) {
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
          placeholder={t('teachers.search')}
          aria-label={t('teachers.searchLabel')}
          className="ps-9"
        />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="sm:w-48">
            <Select disabled value={ALL}>
              <SelectTrigger className="w-full" aria-label={t('teachers.filters.subjectLabel')}>
                <SelectValue placeholder={t('teachers.filters.subjectAll')} />
              </SelectTrigger>
            </Select>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('teachers.filters.subjectComingSoon')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
