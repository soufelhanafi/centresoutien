import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { formatIsoDate } from '../../lib/center-hours-overrides/dates';
import type { GeneratorConflict, GeneratorGroupProposal } from '../../lib/planning/session-generator-gateway';

/**
 * The non-blocking warnings for one group's proposal (SOU-161): center-hours
 * overruns, room double-bookings, and — in custom mode — min-gap breaches. Each
 * is informational; the admin decides whether to adjust the config or commit
 * anyway. Renders nothing when the proposal is clean.
 */
export function GeneratorWarnings({
  conflicts,
  gapViolations,
  roomName,
}: {
  conflicts: readonly GeneratorConflict[];
  gapViolations: GeneratorGroupProposal['gapViolations'];
  roomName: (roomId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const weekday = (day: number): string => t(`planning.weekdays.${day}`);

  if (conflicts.length === 0 && gapViolations.length === 0) return null;

  // Dedup is by STRUCTURAL key, never by rendered text (SOU-262): two distinct
  // problems may word identically (e.g. two gap breaches with equal gapDays on
  // different day pairs) and must both survive; only true duplicates — the same
  // kind at the same slot against the same room/teacher — collapse to one line.
  const lineByKey = new Map<string, string>();
  const slot = (conflict: GeneratorConflict): string =>
    `${conflict.dayOfWeek}|${conflict.start}|${conflict.end}`;
  for (const conflict of conflicts) {
    if (conflict.kind === 'hours') {
      lineByKey.set(
        `hours|${slot(conflict)}|${conflict.reason}`,
        t(`planning.generator.warnings.hours.${conflict.reason}`, { day: weekday(conflict.dayOfWeek) }),
      );
    } else if (conflict.kind === 'teacher') {
      lineByKey.set(
        `teacher|${slot(conflict)}|${conflict.teacherId}`,
        t('planning.generator.warnings.teacher', { day: weekday(conflict.dayOfWeek) }),
      );
    } else if (conflict.kind === 'teacher-availability') {
      lineByKey.set(
        `teacher-availability|${slot(conflict)}|${conflict.teacherId}|${conflict.reason}`,
        conflict.reason === 'exception' && conflict.exception !== null
          ? t('planning.generator.warnings.teacherAvailability.exception', {
              from: formatIsoDate(conflict.exception.start, i18n.language),
              to: formatIsoDate(conflict.exception.end, i18n.language),
            })
          : t('planning.generator.warnings.teacherAvailability.outOfWindow', {
              day: weekday(conflict.dayOfWeek),
            }),
      );
    } else {
      lineByKey.set(
        `room|${slot(conflict)}|${conflict.roomId}`,
        t('planning.generator.warnings.room', {
          room: roomName(conflict.roomId),
          day: weekday(conflict.dayOfWeek),
        }),
      );
    }
  }
  for (const gap of gapViolations) {
    lineByKey.set(
      `gap|${gap.fromDay}|${gap.toDay}|${gap.gapDays}`,
      t('planning.generator.warnings.gap', { count: gap.gapDays }),
    );
  }
  const uniqueLines = [...lineByKey.values()];

  return (
    <ul className="space-y-1">
      {uniqueLines.map((line, index) => (
        <li key={index} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
