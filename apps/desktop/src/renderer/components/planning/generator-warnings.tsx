import { useTranslation } from 'react-i18next';
import { Ban, TriangleAlert } from 'lucide-react';
import { cn } from '@centresoutien/ui';
import { formatIsoDate } from '../../lib/center-hours-overrides/dates';
import type { GeneratorConflict, GeneratorGroupProposal } from '../../lib/planning/session-generator-gateway';

/** One rendered warning line: its text plus whether it is a hard, non-forceable block (SOU-275). */
type WarningLine = { readonly text: string; readonly blocking: boolean };

/**
 * The warnings for one group's proposal (SOU-161): center-hours overruns, room /
 * teacher double-bookings, min-gap breaches, and — SOU-275 — a seat-overflow
 * "capacity" conflict. Most are informational (the admin decides whether to adjust
 * the config or force them in); a capacity conflict is a hard block, rendered in a
 * distinct destructive treatment because it can never be committed. Renders
 * nothing when the proposal is clean.
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
  const lineByKey = new Map<string, WarningLine>();
  const slot = (conflict: GeneratorConflict): string =>
    `${conflict.dayOfWeek}|${conflict.start}|${conflict.end}`;
  for (const conflict of conflicts) {
    if (conflict.kind === 'hours') {
      lineByKey.set(`hours|${slot(conflict)}|${conflict.reason}`, {
        text: t(`planning.generator.warnings.hours.${conflict.reason}`, { day: weekday(conflict.dayOfWeek) }),
        blocking: false,
      });
    } else if (conflict.kind === 'teacher') {
      lineByKey.set(`teacher|${slot(conflict)}|${conflict.teacherId}`, {
        text: t('planning.generator.warnings.teacher', { day: weekday(conflict.dayOfWeek) }),
        blocking: false,
      });
    } else if (conflict.kind === 'teacher-availability') {
      lineByKey.set(`teacher-availability|${slot(conflict)}|${conflict.teacherId}|${conflict.reason}`, {
        text:
          conflict.reason === 'exception' && conflict.exception !== null
            ? t('planning.generator.warnings.teacherAvailability.exception', {
                from: formatIsoDate(conflict.exception.start, i18n.language),
                to: formatIsoDate(conflict.exception.end, i18n.language),
              })
            : t('planning.generator.warnings.teacherAvailability.outOfWindow', {
                day: weekday(conflict.dayOfWeek),
              }),
        blocking: false,
      });
    } else if (conflict.kind === 'capacity') {
      lineByKey.set(`capacity|${conflict.roomId}`, {
        text: t('planning.generator.warnings.capacity', {
          room: roomName(conflict.roomId),
          groupCapacity: conflict.groupCapacity,
          roomCapacity: conflict.roomCapacity,
        }),
        blocking: true,
      });
    } else {
      lineByKey.set(`room|${slot(conflict)}|${conflict.roomId}`, {
        text: t('planning.generator.warnings.room', {
          room: roomName(conflict.roomId),
          day: weekday(conflict.dayOfWeek),
        }),
        blocking: false,
      });
    }
  }
  for (const gap of gapViolations) {
    lineByKey.set(`gap|${gap.fromDay}|${gap.toDay}|${gap.gapDays}`, {
      text: t('planning.generator.warnings.gap', { count: gap.gapDays }),
      blocking: false,
    });
  }
  const uniqueLines = [...lineByKey.values()];

  return (
    <ul className="space-y-1">
      {uniqueLines.map((line, index) => (
        <li
          key={index}
          className={cn(
            'flex items-start gap-2 text-sm',
            line.blocking ? 'text-destructive' : 'text-amber-700 dark:text-amber-400',
          )}
        >
          {line.blocking ? (
            <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
