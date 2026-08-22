import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Badge, Button } from '@centresoutien/ui';
import { formatDate } from '../../lib/format';
import { formatTimeRange } from '../../lib/planning/time-range';
import { localizedText } from '../../lib/planning/localized-text';
import type { StrandedGroupView } from '../../lib/schedule-audit/stranded-session-view';
import { AuditReasonBadge } from './audit-reason-badge';
import { StrandedSessionRow } from './stranded-session-row';

/**
 * One structural audit problem (SOU-296): every stranded occurrence sharing one
 * reason, weekday, and primary resource, collapsed to a card that reads as "this
 * resource is broken" — reason badge, a neutral ×N count, and a detail line built
 * only from fields genuinely common to every occurrence (shared subject/level,
 * shared time slot, the primary room/teacher, the weekday, the first–last date
 * span). The per-date rows (each keeping its own cancel action) sit behind an
 * expand toggle.
 *
 * The card never borrows the first occurrence's subject/slot as if it were the
 * group's identity: a center-wide group can merge many different classes on the
 * same weekday, so any field that isn't shared by every occurrence is omitted
 * rather than mislabelled. A group of one is a genuinely dated case and renders
 * as the plain row with all its reasons.
 */
export function StrandedGroupRow({ group }: { group: StrandedGroupView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [expanded, setExpanded] = useState(false);

  const first = group.occurrences[0]!;
  if (group.count === 1) {
    return <StrandedSessionRow stranded={first} />;
  }

  const sessions = group.occurrences.map((item) => item.session);
  const { session } = first;
  const last = sessions[sessions.length - 1]!;
  const count = group.count;

  const sharedSubject = sessions.every(
    (item) => item.subjectId !== null && item.subjectId === session.subjectId,
  );
  const sharedSlot = sessions.every(
    (item) => item.start === session.start && item.end === session.end,
  );
  const subject =
    sharedSubject && session.subjectName ? localizedText(session.subjectName, locale) : null;
  const level = sharedSubject ? session.level : null;
  const resourceLabel =
    group.resourceKind === 'room'
      ? session.roomName
      : group.resourceKind === 'teacher'
        ? (session.teacherName ? localizedText(session.teacherName, locale) : null)
        : null;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <AuditReasonBadge reason={group.reason} />
            <Badge variant="neutral">{t('scheduleAudit.group.count', { count })}</Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {subject ? (
              <>
                <span className="font-medium text-foreground">
                  {subject}
                  {level ? ` · ${level}` : ''}
                </span>
                <span aria-hidden="true"> · </span>
              </>
            ) : null}
            {sharedSlot ? (
              <>
                <span>{formatTimeRange(session.start, session.end, locale)}</span>
                <span aria-hidden="true"> · </span>
              </>
            ) : null}
            {resourceLabel ? (
              <>
                <span>{resourceLabel}</span>
                <span aria-hidden="true"> · </span>
              </>
            ) : null}
            <span>{t(`planning.weekdays.${group.weekday}`)}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {t('scheduleAudit.group.range', {
                from: formatDate(session.date, locale),
                to: formatDate(last.date, locale),
              })}
            </span>
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
