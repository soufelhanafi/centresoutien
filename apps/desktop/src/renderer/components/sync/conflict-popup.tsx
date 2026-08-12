import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogContent, DialogHeader, DialogTitle, Tabs, TabsList, TabsTrigger, TabsContent } from '@centresoutien/ui';
import type { DuplicateView, ReversalDedupView, SyncConflictView } from '../../lib/sync/sync-view';
import { groupSyncConflicts } from '../../lib/sync/sync-view';
import { ConflictCard } from './conflict-card';
import { DeleteVsEditCard } from './delete-vs-edit-card';

/**
 * The conflict-resolution popup (SOU-91): tabs per conflict kind — same-field
 * clashes, the dedicated delete-vs-edit tab (never auto-resolved in either
 * direction), and probable duplicates (merged via MergeParents/MergeStudents,
 * not resolved field-by-field). Each card shows who / when / what for both
 * sides and offers whole-entity + per-field resolution.
 */
export function ConflictPopup({
  conflicts,
  reversalDedups = [],
}: {
  conflicts: readonly SyncConflictView[];
  reversalDedups?: readonly ReversalDedupView[];
}) {
  const { t } = useTranslation();
  const grouped = useMemo(() => groupSyncConflicts({ conflicts, reversalDedups }), [conflicts, reversalDedups]);
  const total = conflicts.length + reversalDedups.length;

  const hasAny = total > 0;
  const counts = {
    fieldClashes: grouped.fieldClashes.length,
    deleteVsEdits: grouped.deleteVsEdits.length,
    duplicates: grouped.duplicates.length,
  };

  return (
    <DialogContent closeLabel={t('common.close')} className="max-h-[85vh] w-full max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('sync.popup.title')}</DialogTitle>
      </DialogHeader>
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">{t('sync.popup.none')}</p>
      ) : (
        <Tabs defaultValue="field-clash">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="field-clash">
              {t('sync.popup.tab.fieldClash')} ({counts.fieldClashes})
            </TabsTrigger>
            <TabsTrigger value="delete-vs-edit">
              {t('sync.popup.tab.deleteVsEdit')} ({counts.deleteVsEdits})
            </TabsTrigger>
            <TabsTrigger value="duplicates">
              {t('sync.popup.tab.duplicates')} ({counts.duplicates})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="field-clash" className="space-y-3">
            {grouped.fieldClashes.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('sync.popup.empty')}</p>
            )}
            {grouped.fieldClashes.map((conflict) => (
              <ConflictCard key={conflictKey(conflict)} conflict={conflict} />
            ))}
          </TabsContent>

          <TabsContent value="delete-vs-edit" className="space-y-3">
            {grouped.deleteVsEdits.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('sync.popup.empty')}</p>
            )}
            {grouped.deleteVsEdits.map((conflict) => (
              <DeleteVsEditCard key={conflictKey(conflict)} conflict={conflict} />
            ))}
          </TabsContent>

          <TabsContent value="duplicates" className="space-y-3">
            {grouped.duplicates.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('sync.popup.empty')}</p>
            )}
            {grouped.duplicates.map((duplicate) => (
              <DuplicateCard key={duplicateKey(duplicate)} duplicate={duplicate} />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </DialogContent>
  );
}

function DuplicateCard({ duplicate }: { duplicate: DuplicateView }) {
  const { t } = useTranslation();
  if (duplicate.kind === 'payment-reversal-dedup') {
    return <PaymentReversalDedupCard dedup={duplicate.dedup} />;
  }
  const { conflict } = duplicate;
  const reasonLabel = t(`sync.reasons.${conflict.reason}`) as string;
  const tierLabel = conflict.tier === 'exact' ? t('sync.tier.exact') : t('sync.tier.fuzzy');
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium">
        {t('sync.duplicate.kept')} <span className="font-mono text-xs">{conflict.keptId}</span>
      </p>
      <p className="mt-1 text-sm">
        {t('sync.duplicate.candidate')}{' '}
        <span className="font-mono text-xs">{conflict.candidateId}</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {tierLabel} · {reasonLabel}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t('sync.duplicate.mergeHint')}</p>
    </div>
  );
}

function PaymentReversalDedupCard({ dedup }: { dedup: ReversalDedupView }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium">
        {t('sync.paymentReversalDedup.loser')} <span className="font-mono text-xs">{dedup.loserId}</span>
      </p>
      <p className="mt-1 text-sm">
        {t('sync.paymentReversalDedup.winner')}{' '}
        <span className="font-mono text-xs">{dedup.winnerId}</span>
      </p>
      <p className="mt-1 text-sm">
        {t('sync.paymentReversalDedup.reversesPayment')}{' '}
        <span className="font-mono text-xs">{dedup.reversesPaymentId}</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t('sync.paymentReversalDedup.hint')}</p>
    </div>
  );
}

function duplicateKey(duplicate: DuplicateView): string {
  if (duplicate.kind === 'payment-reversal-dedup') {
    return `payment-reversal-dedup:${duplicate.dedup.reversesPaymentId}:${duplicate.dedup.loserId}`;
  }
  return conflictKey(duplicate.conflict);
}

export function conflictKey(conflict: SyncConflictView): string {
  switch (conflict.kind) {
    case 'field-clash':
      return `field-clash:${conflict.entityType}:${conflict.entityId}:${[...conflict.fields].sort().join(',')}`;
    case 'delete-vs-edit':
      return `delete-vs-edit:${conflict.entityType}:${conflict.entityId}`;
    case 'probable-duplicate':
      return `probable-duplicate:${conflict.entityType}:${conflict.keptId}:${conflict.candidateId}`;
    default:
      return 'unknown';
  }
}
