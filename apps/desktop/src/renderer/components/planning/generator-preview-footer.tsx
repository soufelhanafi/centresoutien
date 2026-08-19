import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';

/**
 * The preview-step footer (SOU-183): a "Back" button, the "Générer les séances"
 * commit button, and a hint explaining why commit is disabled. Commit stays
 * disabled until every clash has an explicit include/exclude decision — or, when a
 * seat-overflow "capacity" conflict is present (SOU-275), until the admin fixes the
 * room/config and re-previews, since seat overflow is non-forceable and its hint
 * takes precedence over the per-block one.
 */
export function GeneratorPreviewFooter({
  onBack,
  onCommit,
  canCommit,
  isCommitting,
  decisionRequired,
  capacityBlocked,
}: {
  onBack: () => void;
  onCommit: () => void;
  canCommit: boolean;
  isCommitting: boolean;
  decisionRequired: boolean;
  capacityBlocked: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-2">
      {capacityBlocked ? (
        <p className="text-xs text-destructive text-start">
          {t('planning.generator.conflictAction.capacityBlockedHint')}
        </p>
      ) : decisionRequired ? (
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
