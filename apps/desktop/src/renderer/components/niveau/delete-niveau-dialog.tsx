import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  toast,
} from '@centresoutien/ui';
import { useArchiveNiveau } from '../../hooks/niveau/use-archive-niveau';
import { useUpdateNiveau } from '../../hooks/niveau/use-update-niveau';
import { mapNiveauWriteError } from '../../lib/niveaux/niveau-write-error';
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';
import type { NiveauUsageView } from '../../lib/niveaux/niveau-view';
import { pickLocalized } from '../../lib/subjects/localized-name';

/**
 * The "Supprimer" dialog: one entry point, two faces. When `canDelete` is true
 * it confirms a permanent delete (soft-delete, no undo). When false, or when
 * the delete is rejected mid-flight by a race (another device just attached a
 * student/group/teacher), it instead lists what's referencing the niveau and
 * offers deactivating as the reversible alternative. Mirrors
 * `DeleteSubjectDialog`.
 */
export function DeleteNiveauDialog({
  usage,
  open,
  onOpenChange,
}: {
  usage: NiveauUsageView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const archive = useArchiveNiveau();
  const deactivate = useUpdateNiveau(usage.niveau.id);
  const [blocked, setBlocked] = useState(!usage.canDelete);
  const name = localizedNiveauName(usage.niveau.name, i18n.language);

  const handleOpenChange = (next: boolean) => {
    if (next) setBlocked(!usage.canDelete);
    onOpenChange(next);
  };

  const handleConfirmDelete = async () => {
    try {
      await archive.mutateAsync(usage.niveau.id);
      toast.success(t('niveaux.delete.success'));
      onOpenChange(false);
    } catch (error) {
      if (mapNiveauWriteError(error) === 'niveau-in-use') {
        setBlocked(true);
        return;
      }
      toast.error(t('niveaux.delete.error'));
    }
  };

  const handleDeactivateInstead = async () => {
    try {
      await deactivate.mutateAsync({
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        {blocked ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('niveaux.delete.blockedTitle')}</DialogTitle>
              <DialogDescription>
                {t('niveaux.delete.blockedBody', { name, count: usage.inUseCount })}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-40" contentClassName="ps-5">
              <ul className="list-disc space-y-1 text-sm text-foreground">
                {usage.references.map((reference) => (
                  <li key={`${reference.kind}-${reference.id}`}>
                    {t('niveaux.delete.referenceItem', {
                      kind: t(`niveaux.referenceKind.${reference.kind}`),
                      label: pickLocalized(reference.label, i18n.language),
                    })}
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('niveaux.delete.cancel')}
              </Button>
              <Button type="button" disabled={deactivate.isPending} onClick={handleDeactivateInstead}>
                {t('niveaux.delete.deactivateInstead')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('niveaux.delete.title', { name })}</DialogTitle>
              <DialogDescription>{t('niveaux.delete.body', { name })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('niveaux.delete.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={archive.isPending}
                onClick={handleConfirmDelete}
              >
                {t('niveaux.delete.confirm')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
