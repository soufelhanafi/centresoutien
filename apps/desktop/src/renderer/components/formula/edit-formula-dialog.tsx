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
import { useUpdateFormula } from '../../hooks/formula/use-update-formula';
import { mapFormulaWriteError } from '../../lib/formulas/formula-write-error';
import type { FormulaView } from '../../lib/formulas/formula-view';
import { FormulaForm } from './formula-form';

/**
 * Edit-formula flow: owns the mutation, toasts the result, closes on success.
 * The caller must only ever open this on a mutable (`!isImmutable`) formula —
 * an immutable one rejects every patch with `FormulaImmutableError`, so the
 * row actions gate access before this ever mounts. Also backs the
 * clone-and-edit flow: after "Dupliquer" the row actions open this same
 * dialog on the freshly cloned (always-mutable) formula.
 */
export function EditFormulaDialog({
  formula,
  open,
  onOpenChange,
}: {
  formula: FormulaView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const update = useUpdateFormula(formula.id);

  const handleSubmit = async (values: FormulaInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('formulas.form.editSuccess'));
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
          <DialogTitle>{t('formulas.form.editTitle')}</DialogTitle>
          <DialogDescription>{t('formulas.form.editDescription')}</DialogDescription>
        </DialogHeader>
        <FormulaForm
          formId={formId}
          defaultValues={{
            name: { fr: formula.name.fr, ar: formula.name.ar },
            subjectIds: [...formula.subjectIds],
            priceMad: formula.priceMad,
            kind: formula.kind,
          }}
          onSubmit={handleSubmit}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('formulas.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={update.isPending}>
            {update.isPending ? t('formulas.form.saving') : t('formulas.form.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
