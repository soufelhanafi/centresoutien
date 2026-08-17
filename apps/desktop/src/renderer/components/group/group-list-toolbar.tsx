import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { GROUP_KINDS } from '@centresoutien/domain';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useNiveauxActive } from '../../hooks/niveau/use-niveaux-active';
import { localizedName } from '../../lib/groups/localized-name';
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';
import type { GroupFilters } from './group-filters';
import { ALL } from './group-filters';
import type { SubjectOption } from '../../lib/groups/group-view';

type GroupListToolbarProps = {
  filters: GroupFilters;
  onChange: (filters: GroupFilters) => void;
  subjects: readonly SubjectOption[];
};

/**
 * Subject / kind selects + a level text filter. The kind filter only offers
 * exam-prep when the plan includes `core.exam-prep` (Pro+); on Essentiel every
 * group is regular, so the option is hidden. Filtering itself happens
 * client-side in the panel.
 */
export function GroupListToolbar({ filters, onChange, subjects }: GroupListToolbarProps) {
  const { t, i18n } = useTranslation();
  const examPrepEnabled = useFeature('core.exam-prep');
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
          value={filters.level}
          onChange={(event) => onChange({ ...filters, level: event.target.value })}
          placeholder={t('groups.filters.levelLabel')}
          aria-label={t('groups.filters.levelLabel')}
          className="ps-9"
        />
      </div>

      <Select
        value={filters.subjectId}
        onValueChange={(value) => onChange({ ...filters, subjectId: value })}
      >
        <SelectTrigger className="sm:w-52" aria-label={t('groups.filters.subjectLabel')}>
          <SelectValue placeholder={t('groups.filters.subjectAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('groups.filters.subjectAll')}</SelectItem>
          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              {localizedName(subject.name, i18n.language)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.niveauId}
        onValueChange={(value) => onChange({ ...filters, niveauId: value })}
      >
        <SelectTrigger className="sm:w-52" aria-label={t('niveaux.filters.label')}>
          <SelectValue placeholder={t('niveaux.filters.all')} />
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

      {examPrepEnabled && (
        <Select
          value={filters.kind}
          onValueChange={(value) =>
            onChange({ ...filters, kind: value as GroupFilters['kind'] })
          }
        >
          <SelectTrigger className="sm:w-44" aria-label={t('groups.filters.kindLabel')}>
            <SelectValue placeholder={t('groups.filters.kindAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('groups.filters.kindAll')}</SelectItem>
            {GROUP_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`groups.kind.${kind === 'exam-prep' ? 'examPrep' : 'regular'}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
