import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@centresoutien/ui';
import { useUpdateNiveau } from '../../hooks/niveau/use-update-niveau';
import type { NiveauView } from '../../lib/niveaux/niveau-view';
import { NiveauForm, type NiveauFormInput, type NiveauFormValues } from './niveau-form';

/** Maps the read view back to the editable form shape (`code` renders as `''` when none). */
function toFormInput(niveau: NiveauView): NiveauFormInput {
  return {
    name: { fr: niveau.name.fr, ar: niveau.name.ar },
    code: niveau.code ?? '',
    category: niveau.category,
  };
}

/** Edit-niveau flow (rename / change code / change category): owns the mutation. */
export function EditNiveauDialog({
  niveau,
  open,
  onOpenChange,
}: {
  niveau: NiveauView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const update = useUpdateNiveau(niveau.id);

  const handleSubmit = async (values: NiveauFormValues) => {
    try {
      await update.mutateAsync({ ...values, active: niveau.active });
      toast.success(t('niveaux.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('niveaux.form.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('niveaux.form.editTitle')}</DialogTitle>
          <DialogDescription>{t('niveaux.form.editDescription')}</DialogDescription>
        </DialogHeader>
        <NiveauForm formId={formId} defaultValues={toFormInput(niveau)} onSubmit={handleSubmit} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('niveaux.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={update.isPending}>
            {update.isPending ? t('niveaux.form.saving') : t('niveaux.form.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
