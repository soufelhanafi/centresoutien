import { useTranslation } from 'react-i18next';
import { Button, cn } from '@centresoutien/ui';
import type { GeneratorBlockProposal } from '../../lib/planning/session-generator-gateway';
import type { BlockDecision } from '../../hooks/planning/use-generator-decisions';

/**
 * One proposed block in the preview breakdown (SOU-183): its weekday, slot, and
 * room. A clean block renders as a plain row; a conflicting one gains an inline
 * "Inclure malgré le conflit" / "Exclure" toggle whose choice is scoped to this
 * block alone. Until a choice is made, a "décision requise" marker shows and the
 * dialog's commit button stays disabled.
 */
export function GeneratorBlockRow({
  block,
  roomName,
  isConflicting,
  decision,
  onDecide,
}: {
  block: GeneratorBlockProposal;
  roomName: (roomId: string) => string;
  isConflicting: boolean;
  decision: BlockDecision | undefined;
  onDecide: (decision: BlockDecision) => void;
}) {
  const { t } = useTranslation();
  const excluded = decision === 'excluded';

  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={cn('font-medium text-foreground', excluded && 'text-muted-foreground line-through')}>
          {t(`planning.weekdays.${block.dayOfWeek}`)}
        </span>
        <span className={cn('text-muted-foreground', excluded && 'line-through')}>
          {block.start} – {block.end} · {roomName(block.roomId)}
        </span>
      </div>

      {isConflicting ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {decision === undefined ? (
            <span className="me-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              {t('planning.generator.conflictAction.decisionRequired')}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={decision === 'forced' ? 'default' : 'outline'}
            aria-pressed={decision === 'forced'}
            onClick={() => onDecide('forced')}
          >
            {t('planning.generator.conflictAction.include')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={decision === 'excluded' ? 'default' : 'outline'}
            aria-pressed={decision === 'excluded'}
            onClick={() => onDecide('excluded')}
          >
            {t('planning.generator.conflictAction.exclude')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
