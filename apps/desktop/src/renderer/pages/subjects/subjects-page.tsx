import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { SubjectListPanel } from '../../components/subject/subject-list-panel';
import { CreateSubjectDialog } from '../../components/subject/create-subject-dialog';

/** Subjects module (SOU-47): active / inactive tables with create, rename, deactivate, delete. */
export function SubjectsPage() {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);

  return (
    <section aria-labelledby="subjects-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="subjects-title" className="text-xl font-semibold text-foreground">
            {t('subjects.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subjects.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('subjects.new')}
        </Button>
      </header>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">{t('subjects.tabs.active')}</TabsTrigger>
          <TabsTrigger value="inactive">{t('subjects.tabs.inactive')}</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <SubjectListPanel variant="active" onCreate={openCreate} />
        </TabsContent>
        <TabsContent value="inactive" className="mt-4">
          <SubjectListPanel variant="inactive" onCreate={openCreate} />
        </TabsContent>
      </Tabs>

      <CreateSubjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
