import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Repeat } from 'lucide-react';
import { Badge, Button, KindBadge } from '@centresoutien/ui';
import { formatDate } from '../../lib/format';
import { formatTimeRange } from '../../lib/planning/time-range';
import { localizedText } from '../../lib/planning/localized-text';
import type { StrandedGroup } from '../../lib/schedule-audit/group-stranded';
import { AuditReasonBadge } from './audit-reason-badge';
import { StrandedSessionRow } from './stranded-session-row';

/**
 * One structural audit problem (SOU-262): every stranded occurrence of a single
 * recurring template with one reason, collapsed to a card that reads as "this
 * weekly slot is broken" — reason badge, subject/level, the shared time / room /
 * teacher, the first–last date span, and a « se répète (×N) » badge — with the
 * per-date rows (each keeping its own cancel action) behind an expand toggle.
 * A group of one is a genuinely dated case and renders as the plain row.
 */
export function StrandedGroupRow({ group }: { group: StrandedGroup }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [expanded, setExpanded] = useState(false);

  const first = group.occurrences[0]!;
  if (group.occurrences.length === 1) return <StrandedSessionRow stranded={first} />;

  const { session } = first;
  const last = group.occurrences[group.occurrences.length - 1]!.session;
  const count = group.occurrences.length;
  const subject = session.subjectName
    ? localizedText(session.subjectName, locale)
    : t('scheduleAudit.unknownSubject');
  const teacher = session.teacherName ? localizedText(session.teacherName, locale) : null;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <AuditReasonBadge reason={group.reason} />
            <Badge variant="neutral" className="gap-1">
              <Repeat className="h-3 w-3" aria-hidden="true" />
              {t('scheduleAudit.group.repeats', { count })}
            </Badge>
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
            <span>
              {t('scheduleAudit.group.range', {
                from: formatDate(session.date, locale),
                to: formatDate(last.date, locale),
              })}
            </span>
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

        <Button variant="outline" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded
            ? t('scheduleAudit.group.hideDates')
            : t('scheduleAudit.group.showDates', { count })}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </Button>
      </div>

      {expanded ? (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {group.occurrences.map((item) => (
            <StrandedSessionRow key={item.session.id} stranded={item} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
