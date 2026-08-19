import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { formatTimeRange } from '../../lib/planning/time-range';
import { localizedText } from '../../lib/planning/localized-text';
import type { OutOfWindowSessionView } from '../../lib/teacher-availability/availability-recheck-gateway';

/**
 * One now-out-of-window session in the post-save summary (SOU-283): its subject,
 * the weekday, and the Intl-formatted time window. Read-only — the admin reviews
 * and decides later (reschedule / cancel / accept); this row triggers no write.
 */
export function TeacherAvailabilityRecheckRow({ session }: { session: OutOfWindowSessionView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const subject = session.subjectName
    ? localizedText(session.subjectName, locale)
    : t('teachers.availability.recheck.unknownSubject');

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{subject}</p>
        <p className="text-xs text-muted-foreground">
          <span>{t(`planning.weekdays.${session.dayOfWeek}`)}</span>
          <span aria-hidden="true"> · </span>
          <span>{formatTimeRange(session.start, session.end, locale)}</span>
        </p>
      </div>
    </li>
  );
}
