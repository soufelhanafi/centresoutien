import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useStudents } from '../../hooks/student/use-students';
import { deriveLevels, filterByLevel } from '../../lib/students/list-utils';
import { StudentListToolbar } from '../../components/student/student-list-toolbar';
import { StudentSeatsNotice } from '../../components/student/student-seats-notice';
import {
  StudentListContent,
  type StudentListStatus,
} from '../../components/student/student-list-content';
import { CreateStudentSheet } from '../../components/student/create-student-sheet';

/** Students module: searchable, filterable list with create / edit / archive. */
export function StudentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const query = useStudents(search);
  const all = useMemo(() => query.data ?? [], [query.data]);
  const levels = useMemo(() => deriveLevels(all), [all]);
  const students = useMemo(() => filterByLevel(all, level), [all, level]);
  const isFiltered = search.trim() !== '' || level !== '';

  const status: StudentListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : students.length > 0
        ? 'ready'
        : isFiltered
          ? 'noResults'
          : 'empty';

  return (
    <section aria-labelledby="students-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="students-title" className="text-xl font-semibold text-foreground">
            {t('students.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('students.subtitle')}</p>
          {!isFiltered && <StudentSeatsNotice activeCount={all.length} />}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('students.new')}
        </Button>
      </header>

      <StudentListToolbar
        search={search}
        onSearchChange={setSearch}
        level={level}
        onLevelChange={setLevel}
        levels={levels}
      />

      <StudentListContent
        status={status}
        students={students}
        onRetry={() => void query.refetch()}
        onCreate={() => setCreateOpen(true)}
      />

      <CreateStudentSheet open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
