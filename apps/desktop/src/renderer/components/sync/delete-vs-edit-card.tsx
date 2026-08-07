import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';
import type { SyncConflictView } from '../../lib/sync/sync-view';
import { useResolveConflict } from '../../hooks/sync/use-sync';
import { ConflictSideView } from './conflict-side-view';

/**
 * The dedicated delete-vs-edit card (SOU-91) — a staff misunderstanding, never
 * a data race, so it is NEVER auto-resolved in either direction. Two-way human
 * choice only: keep the local side or adopt theirs. No per-field controls.
 */
export function DeleteVsEditCard({ conflict }: { conflict: SyncConflictView }) {
  const { t } = useTranslation();
  const resolve = useResolveConflict();

  if (conflict.kind !== 'delete-vs-edit') return null;

  const resolveWith = (choice: 'take-mine' | 'take-theirs') => {
    void resolve.mutateAsync({
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      resolution: { choice },
    });
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40" aria-label={t('sync.popup.aria.deleteVsEdit')}>
      <p className="mb-1 text-sm font-medium text-amber-800 dark:text-amber-200">
        {t('sync.popup.deleteVsEditTitle')}
      </p>
      <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">{t('sync.popup.deleteVsEditHint')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ConflictSideView side={conflict.mine} label={t('sync.side.mine')} />
        <ConflictSideView side={conflict.theirs} label={t('sync.side.theirs')} />
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolveWith('take-mine')}>
          {t('sync.popup.keepMine')}
        </Button>
        <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolveWith('take-theirs')}>
          {t('sync.popup.takeTheirs')}
        </Button>
      </div>
    </div>
  );
}
