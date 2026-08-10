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
import { useDeactivateFormula } from '../../hooks/formula/use-deactivate-formula';
import type { FormulaView } from '../../lib/formulas/formula-view';
import { localizedFormulaName } from '../../lib/formulas/localized-name';

/**
 * Confirms deactivating a formula. Unlike Subject's instantly-reversible
 * deactivate, a formula has no reactivate path (CLAUDE.md §7 — one-directional
 * by design), so this is a real, if soft, dead end: the dialog says so instead
 * of treating it as a casual toggle.
 */
export function DeactivateFormulaDialog({
  formula,
  open,
  onOpenChange,
}: {
  formula: FormulaView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const deactivate = useDeactivateFormula();
  const name = localizedFormulaName(formula.name, i18n.language);

  const handleConfirm = async () => {
    try {
      await deactivate.mutateAsync(formula.id);
      toast.success(t('formulas.deactivate.success'));
      onOpenChange(false);
    } catch {
      toast.error(t('formulas.deactivate.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('formulas.deactivate.title')}</DialogTitle>
          <DialogDescription>{t('formulas.deactivate.body', { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('formulas.deactivate.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={deactivate.isPending} onClick={handleConfirm}>
            {t('formulas.deactivate.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
