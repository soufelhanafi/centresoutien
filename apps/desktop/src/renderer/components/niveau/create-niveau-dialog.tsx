import { useEffect, useId, useState } from 'react';
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
import { useCreateNiveau } from '../../hooks/niveau/use-create-niveau';
import { mapNiveauWriteError } from '../../lib/niveaux/niveau-write-error';
import { EMPTY_NIVEAU_INPUT, NiveauForm, type NiveauFormServerFieldError, type NiveauFormValues } from './niveau-form';

/**
 * Create-niveau flow: owns the mutation, toasts the result, closes on success.
 * A `DuplicateNiveauCodeError` (a code already live in this center) surfaces as
 * an inline error on the code field; any other failure falls back to the generic
 * save-error toast.
 */
export function CreateNiveauDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const create = useCreateNiveau();
  const [serverCodeError, setServerCodeError] = useState<NiveauFormServerFieldError | null>(null);

  useEffect(() => {
    if (open) setServerCodeError(null);
  }, [open]);

  const handleSubmit = async (values: NiveauFormValues) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('niveaux.form.createSuccess'));
      onOpenChange(false);
    } catch (error) {
      const code = mapNiveauWriteError(error);
      if (code === 'duplicate-niveau-code') {
        setServerCodeError({ code });
        return;
      }
      setServerCodeError(null);
      toast.error(t(code ? `errors.${code}` : 'niveaux.form.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('niveaux.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('niveaux.form.createDescription')}</DialogDescription>
        </DialogHeader>
        <NiveauForm
          formId={formId}
          defaultValues={EMPTY_NIVEAU_INPUT}
          onSubmit={handleSubmit}
          serverCodeError={serverCodeError}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('niveaux.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={create.isPending}>
            {create.isPending ? t('niveaux.form.saving') : t('niveaux.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
