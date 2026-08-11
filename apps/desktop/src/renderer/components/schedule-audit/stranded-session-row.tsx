import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, KindBadge } from '@centresoutien/ui';
import { formatDate } from '../../lib/format';
import { formatTimeRange } from '../../lib/planning/time-range';
import { localizedText } from '../../lib/planning/localized-text';
import { useCancelStrandedSession } from '../../hooks/schedule-audit/use-cancel-stranded-session';
import type { StrandedSessionView } from '../../lib/schedule-audit/stranded-session-view';
import { AuditReasonBadge } from './audit-reason-badge';
import { CancelStrandedSessionDialog } from './cancel-stranded-session-dialog';

/**
 * One stranded session in the audit report: its reason badge, group subject /
 * level, the occurrence's Intl-formatted date and time window, and its room and
 * teacher names (bilingual, active-locale). The cancel button soft-deletes ONLY
 * this dated occurrence (its `ses_…` id) behind a confirm dialog — the recurring
 * template and every other date stay untouched.
 */
export function StrandedSessionRow({ stranded }: { stranded: StrandedSessionView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { session, reason } = stranded;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelMutation = useCancelStrandedSession();

  const subject = session.subjectName
    ? localizedText(session.subjectName, locale)
    : t('scheduleAudit.unknownSubject');
  const teacher = session.teacherName ? localizedText(session.teacherName, locale) : null;
  const confirmCancel = () =>
    cancelMutation.mutate(session.id, { onSuccess: () => setConfirmOpen(false) });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <AuditReasonBadge reason={reason} />
          {session.kind === 'exam-prep' ? (
            <KindBadge kind="exam-prep" label={t('planning.kind.examPrepShort')} />
          ) : null}
        </div>
        <p className="truncate text-sm font-semibold text-foreground">
          {subject}
          {session.level ? (
            <span className="text-muted-foreground font-normal"> · {session.level}</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          <span>{formatDate(session.date, locale)}</span>
          <span aria-hidden="true"> · </span>
          <span>{formatTimeRange(session.start, session.end, locale)}</span>
          {session.roomName ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>{session.roomName}</span>
            </>
          ) : null}
          {teacher ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>{teacher}</span>
            </>
          ) : null}
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => setConfirmOpen(true)}
      >
        {t('scheduleAudit.cancel.trigger')}
      </Button>

      <CancelStrandedSessionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmCancel}
        pending={cancelMutation.isPending}
      />
    </li>
  );
}
