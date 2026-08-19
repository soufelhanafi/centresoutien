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
} from '@centresoutien/ui';
import type { OutOfWindowSessionView } from '../../lib/teacher-availability/availability-recheck-gateway';
import { TeacherAvailabilityRecheckRow } from './teacher-availability-recheck-row';

type TeacherAvailabilityRecheckDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: readonly OutOfWindowSessionView[];
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
}: TeacherAvailabilityRecheckDialogProps) {
  const { t } = useTranslation();
  if (sessions.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('teachers.availability.recheck.title')}</DialogTitle>
          <DialogDescription>
            {t('teachers.availability.recheck.description', { count: sessions.length })}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh]" contentClassName="pe-1">
          <ul className="space-y-2">
            {sessions.map((session) => (
              <TeacherAvailabilityRecheckRow key={session.sessionId} session={session} />
            ))}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('teachers.availability.recheck.dismiss')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
