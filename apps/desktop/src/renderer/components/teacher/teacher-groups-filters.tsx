import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@centresoutien/ui';
import type { GroupKind } from '../../lib/groups/group-view';
import type {
  TeacherGroupsFilter,
  TeacherGroupsKindFilter,
} from '../../lib/teachers/filter-teacher-groups';

const ALL = 'all';

type Props = {
  filter: TeacherGroupsFilter;
  kinds: readonly GroupKind[];
  onChange: (next: TeacherGroupsFilter) => void;
};

/** A name search + a kind select (shown only for a teacher who leads both tracks),
 *  composing with AND (SOU-317). */
export function TeacherGroupsFilters({ filter, kinds, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search
          className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={filter.nameQuery}
          onChange={(event) => onChange({ ...filter, nameQuery: event.target.value })}
          placeholder={t('teachers.detail.groups.filters.searchPlaceholder')}
          aria-label={t('teachers.detail.groups.filters.searchLabel')}
          className="ps-8"
        />
      </div>

      {kinds.length > 1 ? (
        <Select
          value={filter.kind}
          onValueChange={(value) => onChange({ ...filter, kind: value as TeacherGroupsKindFilter })}
        >
          <SelectTrigger className="w-44" aria-label={t('teachers.detail.groups.filters.kindLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('teachers.detail.groups.filters.allKinds')}</SelectItem>
            <SelectItem value="regular">{t('teachers.detail.groups.kind.regular')}</SelectItem>
            <SelectItem value="exam-prep">{t('teachers.detail.groups.kind.examPrep')}</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
