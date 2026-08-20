import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { formatTimeRange } from '../../lib/planning/time-range';
import { localizedText } from '../../lib/planning/localized-text';
import { formatIsoDate } from '../../lib/center-hours-overrides/dates';
import type { OutOfWindowOccurrenceView } from '../../lib/teacher-availability/availability-recheck-gateway';

// One dated occurrence a just-saved one-off absence now covers (SOU-287): its
// subject, the local-formatted date, and the Intl-formatted time window.
export function TeacherAvailabilityRecheckOccurrenceRow({
  occurrence,
}: {
  occurrence: OutOfWindowOccurrenceView;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const subject = occurrence.subjectName
    ? localizedText(occurrence.subjectName, locale)
    : t('teachers.availability.recheck.unknownSubject');

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{subject}</p>
        <p className="text-xs text-muted-foreground">
          <span dir="ltr" className="tabular-nums">
            {formatIsoDate(occurrence.date, locale)}
          </span>
          <span aria-hidden="true"> · </span>
          <span>{formatTimeRange(occurrence.start, occurrence.end, locale)}</span>
        </p>
      </div>
    </li>
  );
}
