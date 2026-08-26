import { useTranslation } from 'react-i18next';
import { Ban, TriangleAlert } from 'lucide-react';
import { cn } from '@centresoutien/ui';
import { formatIsoDate } from '../../lib/center-hours-overrides/dates';
import type { GeneratorConflict, GeneratorGroupProposal } from '../../lib/planning/session-generator-gateway';

/** One rendered warning line: its text plus whether it is a hard, non-forceable block (SOU-275). */
type WarningLine = { readonly text: string; readonly blocking: boolean };

/** The i18n/label helpers the warning-line builder needs, kept out of it so it stays pure and testable. */
type WarningDeps = {
  readonly t: ReturnType<typeof useTranslation>['t'];
  readonly language: string;
  readonly weekday: (day: number) => string;
  readonly roomName: (roomId: string) => string;
};

const slotKey = (conflict: GeneratorConflict): string =>
  `${conflict.dayOfWeek}|${conflict.start}|${conflict.end}`;

/**
 * One `[dedupKey, WarningLine]` for a single conflict. Dedup is by STRUCTURAL key,
 * never by rendered text (SOU-262): two distinct problems may word identically and
 * must both survive; only true duplicates — same kind, slot, room/teacher — collapse.
 * A `capacity` conflict (SOU-275) is the sole `blocking` line: seat overflow can
 * never be committed, so it renders in the distinct destructive treatment.
 */
function conflictToWarning(conflict: GeneratorConflict, deps: WarningDeps): readonly [string, WarningLine] {
  const { t, language, weekday, roomName } = deps;
  const slot = slotKey(conflict);
  if (conflict.kind === 'hours') {
    return [
      `hours|${slot}|${conflict.reason}`,
      { text: t(`planning.generator.warnings.hours.${conflict.reason}`, { day: weekday(conflict.dayOfWeek) }), blocking: false },
    ];
  }
  if (conflict.kind === 'teacher') {
    return [
      `teacher|${slot}|${conflict.teacherId}`,
      { text: t('planning.generator.warnings.teacher', { day: weekday(conflict.dayOfWeek) }), blocking: false },
    ];
  }
  if (conflict.kind === 'teacher-availability') {
    return [
      `teacher-availability|${slot}|${conflict.teacherId}|${conflict.reason}`,
      {
        text:
          conflict.reason === 'exception' && conflict.exception !== null
            ? t('planning.generator.warnings.teacherAvailability.exception', {
                from: formatIsoDate(conflict.exception.start, language),
                to: formatIsoDate(conflict.exception.end, language),
              })
            : t('planning.generator.warnings.teacherAvailability.outOfWindow', { day: weekday(conflict.dayOfWeek) }),
        blocking: false,
      },
    ];
  }
  if (conflict.kind === 'capacity') {
    return [
      `capacity|${slot}|${conflict.roomId}`,
      {
        text: t('planning.generator.warnings.capacity', {
          room: roomName(conflict.roomId),
          groupCapacity: conflict.groupCapacity,
          roomCapacity: conflict.roomCapacity,
        }),
        blocking: true,
      },
    ];
  }
  if (conflict.kind === 'student') {
    return [
      `student|${slot}`,
      {
        text: t('planning.generator.warnings.student', {
          count: conflict.conflicts.length,
          day: weekday(conflict.dayOfWeek),
        }),
        blocking: false,
      },
    ];
  }
  return [
    `room|${slot}|${conflict.roomId}`,
    { text: t('planning.generator.warnings.room', { room: roomName(conflict.roomId), day: weekday(conflict.dayOfWeek) }), blocking: false },
  ];
}

/**
 * A group generated fewer sessions than requested (SOU-296). `reason` names why,
 * since the two causes need different remediation and must not share one
 * message: `'teacher-availability'` — the teacher doesn't have enough usable
 * days at all; `'min-gap'` — enough usable days exist, but no subset of them
 * respects the run's minimum spacing between sessions. `null` only when the
 * domain hasn't classified it (defensive; every real shortfall carries a reason).
 */
export type GeneratorSessionShortfall = {
  readonly requested: number;
  readonly generated: number;
  readonly reason: 'teacher-availability' | 'min-gap' | null;
};

/** Structurally-deduped warning lines for one proposal's conflicts + min-gap breaches + session shortfall. */
function buildWarningLines(
  conflicts: readonly GeneratorConflict[],
  gapViolations: GeneratorGroupProposal['gapViolations'],
  shortfall: GeneratorSessionShortfall | null,
  deps: WarningDeps,
): readonly WarningLine[] {
  const lineByKey = new Map<string, WarningLine>();
  for (const conflict of conflicts) {
    const [key, line] = conflictToWarning(conflict, deps);
    lineByKey.set(key, line);
  }
  for (const gap of gapViolations) {
    lineByKey.set(`gap|${gap.fromDay}|${gap.toDay}|${gap.gapDays}`, {
      text: deps.t('planning.generator.warnings.gap', { count: gap.gapDays }),
      blocking: false,
    });
  }
  if (shortfall !== null) {
    const messageKey =
      shortfall.reason === 'min-gap'
        ? 'planning.generator.warnings.sessionCountMinGap'
        : 'planning.generator.warnings.sessionCountAvailability';
    lineByKey.set(`session-count|${shortfall.generated}|${shortfall.requested}`, {
      text: deps.t(messageKey, {
        actual: shortfall.generated,
        requested: shortfall.requested,
      }),
      blocking: false,
    });
  }
  return [...lineByKey.values()];
}

/**
 * The warnings for one group's proposal (SOU-161): center-hours overruns, room /
 * teacher / student double-bookings, min-gap breaches, and — SOU-275 — a
 * seat-overflow "capacity" conflict. Most are informational (the admin decides
 * whether to adjust the config or force them in); a capacity conflict is a hard
 * block, rendered in a distinct destructive treatment because it can never be
 * committed. Renders nothing when the proposal is clean.
 */
export function GeneratorWarnings({
  conflicts,
  gapViolations,
  shortfall = null,
  roomName,
}: {
  conflicts: readonly GeneratorConflict[];
  gapViolations: GeneratorGroupProposal['gapViolations'];
  shortfall?: GeneratorSessionShortfall | null;
  roomName: (roomId: string) => string;
}) {
  const { t, i18n } = useTranslation();

  if (conflicts.length === 0 && gapViolations.length === 0 && shortfall === null) return null;

  const uniqueLines = buildWarningLines(conflicts, gapViolations, shortfall, {
    t,
    language: i18n.language,
    weekday: (day) => t(`planning.weekdays.${day}`),
    roomName,
  });

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
