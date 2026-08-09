import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';

/**
 * The preview-step footer (SOU-183): a "Back" button, the "Générer les séances"
 * commit button, and — when any conflicting block is still undecided — a hint
 * explaining why commit is disabled. Commit stays disabled until every clash has
 * an explicit include/exclude decision.
 */
export function GeneratorPreviewFooter({
  onBack,
  onCommit,
  canCommit,
  isCommitting,
  decisionRequired,
}: {
  onBack: () => void;
  onCommit: () => void;
  canCommit: boolean;
  isCommitting: boolean;
  decisionRequired: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-2">
      {decisionRequired ? (
        <p className="text-xs text-amber-700 dark:text-amber-400 text-start">
          {t('planning.generator.conflictAction.commitBlockedHint')}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('planning.generator.back')}
        </Button>
        <Button type="button" onClick={onCommit} disabled={!canCommit}>
          {isCommitting ? t('planning.generator.committing') : t('planning.generator.commitAction')}
        </Button>
      </div>
    </div>
  );
}
