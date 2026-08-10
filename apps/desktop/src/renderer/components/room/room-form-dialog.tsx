import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomInput } from '../../lib/rooms/room-view';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@centresoutien/ui';
import { RoomForm } from './room-form';

type RoomFormDialogProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: RoomInput;
  pending: boolean;
  onSubmit: (values: RoomInput) => void | Promise<void>;
};

/**
 * Presentational shell for the quick create/edit room dialog. Owns no mutation —
 * the flow wrapper (create/edit) passes `onSubmit` and `pending`. Titles and the
 * submit label derive from `mode`, so the two flows share one layout. A dialog
 * (not a drawer) fits the two-field "quick edit" the ticket calls for.
 */
export function RoomFormDialog({ mode, open, onOpenChange, defaultValues, pending, onSubmit }: RoomFormDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const submitLabel = mode === 'create' ? t('rooms.form.create') : t('rooms.form.save');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t(`rooms.form.${mode}Title`)}</DialogTitle>
          <DialogDescription>{t(`rooms.form.${mode}Description`)}</DialogDescription>
        </DialogHeader>
        <RoomForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('rooms.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('rooms.form.saving') : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
