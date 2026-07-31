import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { useTeachers } from '../../hooks/teacher/use-teachers';
import { TeacherListToolbar } from '../../components/teacher/teacher-list-toolbar';
import { TeacherSeatsNotice } from '../../components/teacher/teacher-seats-notice';
import { TeacherListPanel } from '../../components/teacher/teacher-list-panel';
import { CreateTeacherSheet } from '../../components/teacher/create-teacher-sheet';

/** Teachers module: active / archived lists with search, create, edit, archive, restore. */
export function TeachersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);

  // The plan cap is on all live teachers, so the nudge tracks the unfiltered active
  // list (its own query — never the search-filtered or archived view).
  const activeCount = useTeachers('active', '').data?.length ?? 0;

  return (
    <section aria-labelledby="teachers-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="teachers-title" className="text-xl font-semibold text-foreground">
            {t('teachers.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('teachers.subtitle')}</p>
          <TeacherSeatsNotice activeCount={activeCount} />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('teachers.new')}
        </Button>
      </header>

      <TeacherListToolbar search={search} onSearchChange={setSearch} />

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">{t('teachers.tabs.active')}</TabsTrigger>
          <TabsTrigger value="archived">{t('teachers.tabs.archived')}</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <TeacherListPanel variant="active" search={search} onCreate={openCreate} />
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          <TeacherListPanel variant="archived" search={search} onCreate={openCreate} />
        </TabsContent>
      </Tabs>

      <CreateTeacherSheet open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
