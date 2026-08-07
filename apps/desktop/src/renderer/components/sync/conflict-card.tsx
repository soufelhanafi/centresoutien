import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';
import type { SyncConflictView } from '../../lib/sync/sync-view';
import type { ConflictResolutionView } from '../../lib/sync/sync-view';
import { useResolveConflict } from '../../hooks/sync/use-sync';
import { ConflictSideView } from './conflict-side-view';

/**
 * One same-field clash card: who / when / what for both sides, per-field
 * resolution (mine for the phone, theirs for the address), and whole-entity
 * shortcuts "Prendre ma version" / "Prendre leur version". Confirming a choice
 * is always a human click — resolving never happens automatically.
 */
export function ConflictCard({ conflict }: { conflict: SyncConflictView }) {
  const { t } = useTranslation();
  const resolve = useResolveConflict();

  if (conflict.kind !== 'field-clash') return null;

  const resolveWith = (resolution: ConflictResolutionView) => {
    void resolve.mutateAsync({
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      resolution,
    });
  };

  return (
    <div className="rounded-lg border p-4" aria-label={t('sync.popup.aria.fieldClash')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {t(`sync.entities.${conflict.entityType}` as never) || conflict.entityType}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => resolveWith({ choice: 'take-mine' })}>
            {t('sync.popup.takeMine')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => resolveWith({ choice: 'take-theirs' })}>
            {t('sync.popup.takeTheirs')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ConflictSideView side={conflict.mine} label={t('sync.side.mine')} />
        <ConflictSideView side={conflict.theirs} label={t('sync.side.theirs')} />
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t('sync.popup.perField')}</p>
        <div className="flex flex-wrap gap-2">
          {conflict.fields.map((field) => (
            <div key={field} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <span className="text-xs">{field}</span>
              <span className="text-xs text-muted-foreground">→</span>
              <span className="text-xs">{formatFieldValue(conflict, field)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={resolve.isPending}
            onClick={() =>
              resolveWith({
                choice: 'per-field',
                fields: Object.fromEntries(conflict.fields.map((f) => [f, 'mine' as const])),
              })
            }
          >
            {t('sync.popup.allMine')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={resolve.isPending}
            onClick={() =>
              resolveWith({
                choice: 'per-field',
                fields: Object.fromEntries(conflict.fields.map((f) => [f, 'theirs' as const])),
              })
            }
          >
            {t('sync.popup.allTheirs')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatFieldValue(conflict: Extract<SyncConflictView, { kind: 'field-clash' }>, field: string): string {
  const mine = conflict.mine.entity[field];
  const theirs = conflict.theirs.entity[field];
  if (mine === theirs) return String(mine ?? '');
  return `${String(mine ?? '')} ≠ ${String(theirs ?? '')}`;
}
