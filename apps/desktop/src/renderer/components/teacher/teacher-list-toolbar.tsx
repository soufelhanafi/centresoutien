import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { useSubjects } from '../../hooks/subject/use-subjects';
import { localizedSubjectName } from '../../lib/subjects/localized-name';

/** Sentinel for the "all subjects" option — Radix Select forbids an empty value. */
export const SUBJECT_FILTER_ALL = '__all__';

type TeacherListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  subjectId: string;
  onSubjectChange: (value: string) => void;
};

/**
 * Search box + subject filter for the teacher lists. The filter is populated from
 * the active subjects (`subject.list` scope `active`, SOU-124) and disabled while
 * they load or when the center has configured none; `SUBJECT_FILTER_ALL` clears it.
 * Filtering itself happens client-side in {@link TeacherListPanel}.
 */
export function TeacherListToolbar({
  search,
  onSearchChange,
  subjectId,
  onSubjectChange,
}: TeacherListToolbarProps) {
  const { t, i18n } = useTranslation();
  const subjectsQuery = useSubjects('active');
  const subjects = subjectsQuery.data ?? [];

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

      <Select
        value={subjectId}
        onValueChange={onSubjectChange}
        disabled={subjectsQuery.isPending || subjects.length === 0}
      >
        <SelectTrigger className="sm:w-56" aria-label={t('teachers.filters.subjectLabel')}>
          <SelectValue placeholder={t('teachers.filters.subjectAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SUBJECT_FILTER_ALL}>{t('teachers.filters.subjectAll')}</SelectItem>
          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              {localizedSubjectName(subject.name, i18n.language)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
