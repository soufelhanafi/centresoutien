import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@centresoutien/ui';
import { useStrandedSessions } from '../../hooks/schedule-audit/use-stranded-sessions';
import { ScheduleAuditList, type ScheduleAuditStatus } from './schedule-audit-list';

/**
 * "Audit du planning" (SOU-240): the planner-header trigger plus the review
 * modal, replacing the standalone page. The button carries a count badge of
 * stranded sessions; the modal reuses `ScheduleAuditList` unchanged. The caller
 * gates the whole component on `settings.center-hours` — no LockOverlay here,
 * the button simply doesn't exist when the feature is off. Cancelling a row
 * invalidates `scheduleAuditKeys.all`, and this modal refreshes in place through
 * the same query cache the page used.
 */
export function ScheduleAuditDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const query = useStrandedSessions();

  const stranded = query.data ?? [];
  const status: ScheduleAuditStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : stranded.length > 0
        ? 'ready'
        : 'empty';
  const count = stranded.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          {t('planning.audit.trigger')}
          {count > 0 ? (
            <Badge variant="destructive" shape="pill" aria-label={t('planning.audit.badgeAria', { count })}>
              {count}
            </Badge>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('scheduleAudit.title')}</DialogTitle>
          <DialogDescription>{t('scheduleAudit.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pe-1">
          <ScheduleAuditList status={status} stranded={stranded} onRetry={() => void query.refetch()} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
