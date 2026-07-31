import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useTeachers } from '../../hooks/teacher/use-teachers';
import { TeacherListToolbar } from '../../components/teacher/teacher-list-toolbar';
import { TeacherSeatsNotice } from '../../components/teacher/teacher-seats-notice';
import {
  TeacherListContent,
  type TeacherListStatus,
} from '../../components/teacher/teacher-list-content';
import { CreateTeacherSheet } from '../../components/teacher/create-teacher-sheet';

/** Teachers module: searchable list with create / edit / archive. */
export function TeachersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const query = useTeachers(search);
  const teachers = useMemo(() => query.data ?? [], [query.data]);
  const isFiltered = search.trim() !== '';

  const status: TeacherListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : teachers.length > 0
        ? 'ready'
        : isFiltered
          ? 'noResults'
          : 'empty';

  return (
    <section aria-labelledby="teachers-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="teachers-title" className="text-xl font-semibold text-foreground">
            {t('teachers.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('teachers.subtitle')}</p>
          {!isFiltered && <TeacherSeatsNotice activeCount={teachers.length} />}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('teachers.new')}
        </Button>
      </header>

      <TeacherListToolbar search={search} onSearchChange={setSearch} />

      <TeacherListContent
        status={status}
        teachers={teachers}
        onRetry={() => void query.refetch()}
        onCreate={() => setCreateOpen(true)}
      />

      <CreateTeacherSheet open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
