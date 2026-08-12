import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Dialog, DialogTrigger, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useRunSync, useBlockedConflicts } from '../../hooks/sync/use-sync';
import { ConflictPopup, conflictKey } from '../../components/sync/conflict-popup';

/**
 * Synchronisation module (SOU-91): runs one pull → resolve → push cycle against
 * the embedded hub, and hosts the "conflits en attente" inbox — blocked
 * conflicts that survived a restart. The conflict popup renders tabs per kind
 * and settles each clash with a human click.
 */
export function SyncPage() {
  const { t } = useTranslation();
  const hasSync = useFeature('sync.multi-device');
  const upgradeCta = useUpgradeCta('sync.multi-device');
  const run = useRunSync();
  const conflicts = useBlockedConflicts({ enabled: hasSync });
  const [popupOpen, setPopupOpen] = useState(false);

  const blocked = conflicts.data ?? [];
  const lastResult = run.data;
  const popupConflicts = uniqueConflicts([...blocked, ...(lastResult?.conflicts ?? [])]);
  const popupReversalDedups = lastResult?.reversalDedups ?? [];
  const popupCount = popupConflicts.length + popupReversalDedups.length;

  const onRun = () => {
    void run.mutateAsync().then(() => setPopupOpen(true));
  };

  const content = (
    <section aria-labelledby="sync-title" className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="sync-title" className="text-xl font-semibold text-foreground">
          {t('sync.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('sync.subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('sync.runTitle')}</CardTitle>
          <CardDescription>{t('sync.runHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onRun} disabled={run.isPending}>
              <RefreshCw className={`h-4 w-4 rtl:scale-x-[-1] ${run.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
              {t('sync.runNow')}
            </Button>
            {lastResult && (
              <span className="text-xs text-muted-foreground">
                {t('sync.lastResult', {
                  applied: lastResult.applied,
                  pushed: lastResult.pushed,
                  conflicts: lastResult.conflicts.length + lastResult.reversalDedups.length,
                })}
              </span>
            )}
          </div>
          {lastResult === null && <p className="text-xs text-muted-foreground">{t('sync.notPaired')}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t('sync.inboxTitle')}</CardTitle>
            <CardDescription>{t('sync.inboxHint')}</CardDescription>
          </div>
          {popupCount > 0 && (
            <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  {t('sync.openPopup')} ({popupCount})
                </Button>
              </DialogTrigger>
              <ConflictPopup conflicts={popupConflicts} reversalDedups={popupReversalDedups} />
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {conflicts.isPending ? (
            <p className="text-sm text-muted-foreground">{t('sync.loading')}</p>
          ) : conflicts.isError ? (
            <p className="text-sm text-destructive">{t('sync.error')}</p>
          ) : blocked.length === 0 ? (
            <EmptyState
              icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
              title={t('sync.inboxEmptyTitle')}
              description={t('sync.inboxEmptyBody')}
            />
          ) : (
            <ul className="divide-y" aria-label={t('sync.inboxListLabel')}>
              {blocked.map((conflict) => (
                <li key={conflictKey(conflict)} className="py-2 text-sm">
                  {conflict.kind === 'probable-duplicate'
                    ? `${t('sync.duplicate.kind')} — ${conflict.entityType}`
                    : `${t(`sync.kinds.${conflict.kind}`)} — ${conflict.entityType} ${conflict.entityId}`}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );

  if (!hasSync) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <LockOverlay
          title={t('nav.sync')}
          description={t('plan.locked')}
          ctaLabel={upgradeCta.ctaLabel}
          onCta={upgradeCta.onCta}
        >
          <div className="p-8">{content}</div>
        </LockOverlay>
      </div>
    );
  }

  return content;
}

function uniqueConflicts<T extends Parameters<typeof conflictKey>[0]>(conflicts: readonly T[]): T[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = conflictKey(conflict);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
