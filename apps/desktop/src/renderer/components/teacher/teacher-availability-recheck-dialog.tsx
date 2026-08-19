import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@centresoutien/ui';
import type {
  OutOfWindowOccurrenceView,
  OutOfWindowSessionView,
} from '../../lib/teacher-availability/availability-recheck-gateway';
import { TeacherAvailabilityRecheckList } from './teacher-availability-recheck-list';

type TeacherAvailabilityRecheckDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: readonly OutOfWindowSessionView[];
  occurrences: readonly OutOfWindowOccurrenceView[];
};

/**
 * Non-blocking summary popup (SOU-283): after a teacher's availability is saved,
 * lists the existing sessions the new week now places outside their windows. The
 * save already succeeded — this is dismiss-only (no reschedule/cancel here); the
 * admin acknowledges and decides later. Renders nothing when there is nothing to
 * report, so the caller can mount it unconditionally.
 */
export function TeacherAvailabilityRecheckDialog({
  open,
  onOpenChange,
  sessions,
  occurrences,
}: TeacherAvailabilityRecheckDialogProps) {
  const { t } = useTranslation();
  if (sessions.length === 0 && occurrences.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('teachers.availability.recheck.title')}</DialogTitle>
          <DialogDescription>
            {t('teachers.availability.recheck.description', {
              count: sessions.length + occurrences.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <TeacherAvailabilityRecheckList sessions={sessions} occurrences={occurrences} />
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('teachers.availability.recheck.dismiss')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
