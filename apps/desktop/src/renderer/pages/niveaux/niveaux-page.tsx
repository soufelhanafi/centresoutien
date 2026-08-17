import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { NiveauListPanel } from '../../components/niveau/niveau-list-panel';
import { CreateNiveauDialog } from '../../components/niveau/create-niveau-dialog';

/** Niveaux module (SOU-260): the level taxonomy grouped by category, with create, rename, deactivate, reactivate. */
export function NiveauxPage() {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);

  return (
    <section aria-labelledby="niveaux-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="niveaux-title" className="text-xl font-semibold text-foreground">
            {t('niveaux.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('niveaux.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('niveaux.new')}
        </Button>
      </header>

      <NiveauListPanel onCreate={openCreate} />

      <CreateNiveauDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
