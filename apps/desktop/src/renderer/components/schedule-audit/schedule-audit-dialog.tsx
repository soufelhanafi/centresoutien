import { useMemo, useState } from 'react';
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
  ScrollArea,
} from '@centresoutien/ui';
import { useStrandedSessions } from '../../hooks/schedule-audit/use-stranded-sessions';
import { groupStrandedSessions } from '../../lib/schedule-audit/group-stranded';
import { ScheduleAuditList, type ScheduleAuditStatus } from './schedule-audit-list';

/**
 * Audit du planning (SOU-240): planner-header trigger plus the review modal,
 * replacing the standalone page. Caller gates the whole component on
 * `settings.center-hours` — when off, the trigger is not rendered at all, so
 * no LockOverlay inside.
 */
export function ScheduleAuditDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const query = useStrandedSessions();

  const stranded = query.data;
  // Grouped once here (SOU-262) and shared by the badge and the list — the
  // badge counts structural problems, "3 things to fix", never "34 occurrences
  // of one thing".
  const groups = useMemo(() => groupStrandedSessions(stranded ?? []), [stranded]);
  const status: ScheduleAuditStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : groups.length > 0
        ? 'ready'
        : 'empty';
  const count = groups.length;

  const handleOpenChange = (next: boolean) => {
    if (next && query.isStale) void query.refetch();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
        <ScrollArea className="max-h-[65vh]" contentClassName="pe-1">
          <ScheduleAuditList status={status} groups={groups} onRetry={() => void query.refetch()} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
