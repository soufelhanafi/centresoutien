import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { FormulaListPanel } from '../../components/formula/formula-list-panel';
import { CreateFormulaDialog } from '../../components/formula/create-formula-dialog';

/** Formulas module (SOU-62): active / inactive tables with create, edit, clone, deactivate. */
export function FormulasPage() {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);

  return (
    <section aria-labelledby="formulas-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="formulas-title" className="text-xl font-semibold text-foreground">
            {t('formulas.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('formulas.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('formulas.new')}
        </Button>
      </header>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">{t('formulas.tabs.active')}</TabsTrigger>
          <TabsTrigger value="inactive">{t('formulas.tabs.inactive')}</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <FormulaListPanel variant="active" onCreate={openCreate} />
        </TabsContent>
        <TabsContent value="inactive" className="mt-4">
          <FormulaListPanel variant="inactive" onCreate={openCreate} />
        </TabsContent>
      </Tabs>

      <CreateFormulaDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
