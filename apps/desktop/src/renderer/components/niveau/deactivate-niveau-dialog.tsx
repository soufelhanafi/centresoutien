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
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';
import type { NiveauUsageView } from '../../lib/niveaux/niveau-view';

/**
 * Deactivate-niveau confirm dialog, opened only when the level is referenced
 * (any usage count > 0). Deactivation is allowed — references keep working — but
 * the admin sees the in-use breakdown first (students / groups / teachers), the
 * same guard UX subjects show. A not-in-use level deactivates instantly from the
 * row action instead.
 */
export function DeactivateNiveauDialog({
  usage,
  open,
  onOpenChange,
}: {
  usage: NiveauUsageView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const update = useUpdateNiveau(usage.niveau.id);
  const name = localizedNiveauName(usage.niveau.name, i18n.language);

  const handleConfirm = async () => {
    try {
      await update.mutateAsync({
        name: usage.niveau.name,
        code: usage.niveau.code ?? undefined,
        category: usage.niveau.category,
        active: false,
      });
      toast.success(t('niveaux.deactivate.success'));
      onOpenChange(false);
    } catch {
      toast.error(t('niveaux.deactivate.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('niveaux.deactivate.title', { name })}</DialogTitle>
          <DialogDescription>
            {t('niveaux.deactivate.inUseBody', {
              name,
              students: usage.studentCount,
              groups: usage.groupCount,
              teachers: usage.teacherCount,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('niveaux.deactivate.cancel')}
          </Button>
          <Button type="button" disabled={update.isPending} onClick={handleConfirm}>
            {update.isPending ? t('niveaux.form.saving') : t('niveaux.deactivate.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
