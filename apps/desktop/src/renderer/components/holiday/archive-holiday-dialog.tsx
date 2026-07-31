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
import { useArchiveHoliday } from '../../hooks/holiday/use-archive-holiday';
import type { HolidayView } from '../../lib/holidays/holiday-view';

/** Confirms archiving (soft delete) a holiday; the row then leaves the active list. */
export function ArchiveHolidayDialog({
  holiday,
  open,
  onOpenChange,
}: {
  holiday: HolidayView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const archive = useArchiveHoliday();
  const name = i18n.language === 'ar' ? holiday.name.ar : holiday.name.fr;

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(holiday.id);
      toast.success(t('holidays.archive.success'));
      onOpenChange(false);
    } catch {
      toast.error(t('holidays.archive.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('holidays.archive.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('holidays.archive.title')}</DialogTitle>
          <DialogDescription>{t('holidays.archive.body', { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('holidays.archive.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={archive.isPending} onClick={handleConfirm}>
            {t('holidays.archive.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
