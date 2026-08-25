import { useTranslation } from 'react-i18next';
import { KindBadge } from '@centresoutien/ui';
import { formatTimeRange } from '../../lib/planning/time-range';
import { localizedText } from '../../lib/planning/localized-text';
import type { RecurringSlotWarningView } from '../../lib/schedule-audit/stranded-session-view';
import { AuditReasonBadge } from './audit-reason-badge';

/**
 * One weekly recurring slot a teacher-availability edit now strands (SOU-296bis)
 * — flagged from the template itself, before any concrete occurrence of it is
 * materialized. Reads as a plain informational line (weekday, teacher, room,
 * subject/level): unlike {@link StrandedSessionRow} there is no dated
 * occurrence id to soft-delete, so this row never shows a cancel action — fixing
 * it means editing the recurring slot or the teacher's availability, not
 * cancelling a session.
 */
export function RecurringSlotWarningRow({ warning }: { warning: RecurringSlotWarningView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { session } = warning;

  const subject = session.subjectName
    ? localizedText(session.subjectName, locale)
    : t('scheduleAudit.unknownSubject');
  const teacher = session.teacherName ? localizedText(session.teacherName, locale) : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <AuditReasonBadge reason="outside-teacher-availability" />
          {session.kind === 'exam-prep' ? (
            <KindBadge kind="exam-prep" label={t('planning.kind.examPrepShort')} />
          ) : null}
        </div>
        <p className="truncate text-sm font-semibold text-foreground">
          {subject}
          {session.level ? (
            <span className="text-muted-foreground font-normal">
              <span aria-hidden="true"> · </span>
              {session.level}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          <span>{t(`planning.weekdays.${session.dayOfWeek}`)}</span>
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
    </li>
  );
}
