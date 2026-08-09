import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
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
  const { t } = useTranslation();
  const weekday = (day: number): string => t(`planning.weekdays.${day}`);

  if (conflicts.length === 0 && gapViolations.length === 0) return null;

  const lines: string[] = [];
  for (const conflict of conflicts) {
    if (conflict.kind === 'hours') {
      lines.push(t(`planning.generator.warnings.hours.${conflict.reason}`, { day: weekday(conflict.dayOfWeek) }));
    } else if (conflict.kind === 'teacher') {
      lines.push(t('planning.generator.warnings.teacher', { day: weekday(conflict.dayOfWeek) }));
    } else {
      lines.push(
        t('planning.generator.warnings.room', {
          room: roomName(conflict.roomId),
          day: weekday(conflict.dayOfWeek),
        }),
      );
    }
  }
  for (const gap of gapViolations) {
    lines.push(t('planning.generator.warnings.gap', { count: gap.gapDays }));
  }

  return (
    <ul className="space-y-1">
      {lines.map((line, index) => (
        <li key={index} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
