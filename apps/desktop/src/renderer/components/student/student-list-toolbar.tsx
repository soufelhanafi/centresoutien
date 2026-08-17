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
import { useNiveauxActive } from '../../hooks/niveau/use-niveaux-active';
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';

const ALL = '__all__';

type StudentListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  level: string;
  onLevelChange: (value: string) => void;
  levels: readonly string[];
  niveauId: string;
  onNiveauChange: (value: string) => void;
};

/** Search box + level filter + niveau filter + (disabled) group filter shell. */
export function StudentListToolbar({
  search,
  onSearchChange,
  level,
  onLevelChange,
  levels,
  niveauId,
  onNiveauChange,
}: StudentListToolbarProps) {
  const { t, i18n } = useTranslation();
  const niveaux = useNiveauxActive().data ?? [];

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

      <Select
        value={niveauId === '' ? ALL : niveauId}
        onValueChange={(v) => onNiveauChange(v === ALL ? '' : v)}
      >
        <SelectTrigger className="sm:w-52" aria-label={t('niveaux.filters.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('niveaux.filters.all')}</SelectItem>
          {niveaux.map((niveau) => (
            <SelectItem key={niveau.id} value={niveau.id}>
              {localizedNiveauName(niveau.name, i18n.language)}
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
