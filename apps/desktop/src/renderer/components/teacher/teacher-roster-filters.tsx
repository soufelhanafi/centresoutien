import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@centresoutien/ui';
import type {
  TeacherRosterFilter,
  TeacherRosterStatusFilter,
} from '../../lib/teachers/teacher-roster-view';
import type { TeacherRosterFacet } from '../../lib/teachers/filter-teacher-roster';

const ALL = 'all';

type Props = {
  filter: TeacherRosterFilter;
  subjects: readonly TeacherRosterFacet[];
  groups: readonly TeacherRosterFacet[];
  onChange: (next: TeacherRosterFilter) => void;
};

/** Subject (multi-subject teachers only) / group / status selects + a name search,
 *  composing with AND (SOU-299). */
export function TeacherRosterFilters({ filter, subjects, groups, onChange }: Props) {
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
          placeholder={t('teachers.detail.students.filters.searchPlaceholder')}
          aria-label={t('teachers.detail.students.filters.searchLabel')}
          className="ps-8"
        />
      </div>

      {subjects.length > 1 ? (
        <Select
          value={filter.subjectId ?? ALL}
          onValueChange={(value) => onChange({ ...filter, subjectId: value === ALL ? null : value })}
        >
          <SelectTrigger className="w-44" aria-label={t('teachers.detail.students.filters.subjectLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('teachers.detail.students.filters.allSubjects')}</SelectItem>
            {subjects.map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>
                {subject.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {groups.length > 0 ? (
        <Select
          value={filter.groupId ?? ALL}
          onValueChange={(value) => onChange({ ...filter, groupId: value === ALL ? null : value })}
        >
          <SelectTrigger className="w-44" aria-label={t('teachers.detail.students.filters.groupLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('teachers.detail.students.filters.allGroups')}</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        value={filter.status}
        onValueChange={(value) => onChange({ ...filter, status: value as TeacherRosterStatusFilter })}
      >
        <SelectTrigger className="w-36" aria-label={t('teachers.detail.students.filters.statusLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">{t('teachers.detail.students.filters.statusActive')}</SelectItem>
          <SelectItem value="left">{t('teachers.detail.students.filters.statusLeft')}</SelectItem>
          <SelectItem value="all">{t('teachers.detail.students.filters.statusAll')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
