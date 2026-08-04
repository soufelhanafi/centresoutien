import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { GeneratorConflict, GeneratorGroupProposal } from '../../lib/planning/session-generator-gateway';
import { GeneratorWarnings } from './generator-warnings';

/**
 * One group's row in the preview: its name, its block count, and — expandable —
 * the concrete weekly blocks (weekday + `[start, end)` + assigned room) plus any
 * non-blocking warnings. Uses a native `<details>` so the list is keyboard- and
 * screen-reader-accessible without extra JS. The chevron mirrors in RTL and
 * rotates when open.
 */
export function GeneratorPreviewGroup({
  proposal,
  groupLabel,
  roomName,
  conflicts,
}: {
  proposal: GeneratorGroupProposal;
  groupLabel: string;
  roomName: (roomId: string) => string;
  conflicts: readonly GeneratorConflict[];
}) {
  const { t } = useTranslation();
  const hasWarnings = conflicts.length > 0 || proposal.gapViolations.length > 0;

  return (
    <details className="group rounded-md border border-border">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {groupLabel}
          {hasWarnings ? <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> : null}
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {t('planning.generator.preview.blockCount', { count: proposal.blocks.length })}
          <ChevronDown
            className="h-4 w-4 transition-transform group-open:rotate-180 rtl:-scale-x-100"
            aria-hidden="true"
          />
        </span>
      </summary>

      <div className="space-y-3 border-t border-border px-3 py-2">
        {proposal.blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('planning.generator.preview.noBlocks')}</p>
        ) : (
          <ul className="space-y-1">
            {proposal.blocks.map((block, index) => (
              <li key={index} className="flex items-center justify-between gap-3 text-sm text-foreground">
                <span className="font-medium">{t(`planning.weekdays.${block.dayOfWeek}`)}</span>
                <span className="text-muted-foreground">
                  {block.start} – {block.end} · {roomName(block.roomId)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <GeneratorWarnings conflicts={conflicts} gapViolations={proposal.gapViolations} roomName={roomName} />
      </div>
    </details>
  );
}
