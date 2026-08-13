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
import { useArchiveSubject } from '../../hooks/subject/use-archive-subject';
import { useUpdateSubject } from '../../hooks/subject/use-update-subject';
import { mapSubjectWriteError } from '../../lib/subjects/subject-write-error';
import type { SubjectUsageView } from '../../lib/subjects/subject-view';
import { localizedSubjectName, pickLocalized } from '../../lib/subjects/localized-name';

/**
 * The "Supprimer" dialog: one entry point, two faces. When `canDelete` is true
 * it confirms a permanent delete (soft-delete, no undo — SOU-46). When false, or
 * when the delete is rejected mid-flight by a race (another device just attached
 * a group), it instead lists what's referencing the subject (SOU-135's named
 * breakdown, already loaded with the row — no second round-trip) and offers
 * deactivating as the reversible alternative.
 */
export function DeleteSubjectDialog({
  usage,
  open,
  onOpenChange,
}: {
  usage: SubjectUsageView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const archive = useArchiveSubject();
  const deactivate = useUpdateSubject(usage.subject.id);
  const [blocked, setBlocked] = useState(!usage.canDelete);
  const name = localizedSubjectName(usage.subject.name, i18n.language);

  const handleOpenChange = (next: boolean) => {
    if (next) setBlocked(!usage.canDelete);
    onOpenChange(next);
  };

  const handleConfirmDelete = async () => {
    try {
      await archive.mutateAsync(usage.subject.id);
      toast.success(t('subjects.delete.success'));
      onOpenChange(false);
    } catch (error) {
      if (mapSubjectWriteError(error) === 'subject-in-use') {
        setBlocked(true);
        return;
      }
      toast.error(t('subjects.delete.error'));
    }
  };

  const handleDeactivateInstead = async () => {
    try {
      await deactivate.mutateAsync({ name: usage.subject.name, active: false });
      toast.success(t('subjects.deactivate.success'));
      onOpenChange(false);
    } catch {
      toast.error(t('subjects.deactivate.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        {blocked ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('subjects.delete.blockedTitle')}</DialogTitle>
              <DialogDescription>
                {t('subjects.delete.blockedBody', { name, count: usage.references.length })}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-40" contentClassName="ps-5">
              <ul className="list-disc space-y-1 text-sm text-foreground">
                {usage.references.map((reference) => (
                  <li key={`${reference.kind}-${reference.id}`}>
                    {t('subjects.delete.referenceItem', {
                      kind: t(`subjects.referenceKind.${reference.kind}`),
                      label: pickLocalized(reference.label, i18n.language),
                    })}
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('subjects.delete.cancel')}
              </Button>
              <Button type="button" disabled={deactivate.isPending} onClick={handleDeactivateInstead}>
                {t('subjects.delete.deactivateInstead')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('subjects.delete.title')}</DialogTitle>
              <DialogDescription>{t('subjects.delete.body', { name })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('subjects.delete.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={archive.isPending}
                onClick={handleConfirmDelete}
              >
                {t('subjects.delete.confirm')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
