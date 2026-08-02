import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormulaInput } from '@centresoutien/domain';
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
import { useCreateFormula } from '../../hooks/formula/use-create-formula';
import { mapFormulaWriteError } from '../../lib/formulas/formula-write-error';
import { FormulaForm, EMPTY_FORMULA_INPUT } from './formula-form';

/**
 * Create-formula flow: owns the mutation, toasts the result, closes on
 * success. A `FormulaSubjectUnavailableError` (a bundled subject that is no
 * longer live or was just deactivated) gets its own localized toast; any other
 * failure falls back to the generic save-error toast.
 */
export function CreateFormulaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const create = useCreateFormula();

  const handleSubmit = async (values: FormulaInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('formulas.form.createSuccess'));
      onOpenChange(false);
    } catch (error) {
      const code = mapFormulaWriteError(error);
      toast.error(t(code ? `errors.${code}` : 'formulas.form.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('formulas.form.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('formulas.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('formulas.form.createDescription')}</DialogDescription>
        </DialogHeader>
        <FormulaForm formId={formId} defaultValues={EMPTY_FORMULA_INPUT} onSubmit={handleSubmit} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('formulas.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={create.isPending}>
            {create.isPending ? t('formulas.form.saving') : t('formulas.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
