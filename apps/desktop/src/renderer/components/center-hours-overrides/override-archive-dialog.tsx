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
import { formatIsoDate } from '../../lib/center-hours-overrides/dates';
import { useArchiveCenterHoursOverride } from '../../hooks/center-hours-overrides/use-archive-center-hours-override';
import type { CenterHoursOverrideView } from '../../lib/center-hours-overrides/override-view';

/**
 * Confirms archiving (soft delete) one dated override. On success the override
 * leaves the manager list and stops graying out the calendar. The named period
 * (its date range) anchors the confirmation so the admin knows which one goes.
 */
export function OverrideArchiveDialog({
  override,
  open,
  onOpenChange,
}: {
  override: CenterHoursOverrideView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const archive = useArchiveCenterHoursOverride();
  const period = `${formatIsoDate(override.dateRange.start, i18n.language)} – ${formatIsoDate(
    override.dateRange.end,
    i18n.language,
  )}`;

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(override.id);
      toast.success(t('centerHoursOverrides.archive.success'));
      onOpenChange(false);
    } catch {
      toast.error(t('centerHoursOverrides.archive.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('centerHoursOverrides.archive.title')}</DialogTitle>
          <DialogDescription>{t('centerHoursOverrides.archive.body', { period })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('centerHoursOverrides.archive.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={archive.isPending}
            onClick={handleConfirm}
          >
            {t('centerHoursOverrides.archive.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
