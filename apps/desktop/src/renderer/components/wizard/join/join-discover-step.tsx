import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, Network, SearchX } from 'lucide-react';
import { Button, EmptyState } from '@centresoutien/ui';
import { useDiscoverCenters } from '../../../hooks/hub/use-discover-centers';
import { targetFromDiscovered, type JoinTarget } from '../../../lib/hub/join-target';
import type { DiscoveredHubView } from '../../../lib/hub/hub-gateway';
import { JoinStepHeader } from './join-step-header';
import { JoinManualEntry } from './join-manual-entry';

/**
 * Step 1 of the join branch (SOU-318): browse the LAN for hubs (~2.5s), then list
 * what answered. Covers loading, an empty state with a retry + hint, an error
 * state, and a manual-address fallback for networks where mDNS is blocked.
 *
 * Discovery is a query that runs on mount (no `useEffect`-driven IPC); the retry
 * button re-runs it via `refetch`.
 */
export function JoinDiscoverStep({
  onPick,
  onBack,
}: {
  onPick: (target: JoinTarget) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const discover = useDiscoverCenters();
  const [showManual, setShowManual] = useState(false);

  const centers = discover.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <JoinStepHeader
        icon={<Network className="h-5 w-5" aria-hidden />}
        title={t('hub.join.discover.title')}
        description={t('hub.join.discover.description')}
      />

      <div className="flex flex-col gap-4">
        {discover.isFetching && (
          <div className="flex items-center gap-3 py-6" aria-busy="true">
            <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('hub.join.discover.searching')}</p>
          </div>
        )}

        {!discover.isFetching && discover.isError && (
          <EmptyState
            icon={<SearchX className="h-5 w-5" aria-hidden="true" />}
            title={t('hub.join.discover.errorTitle')}
            description={t('hub.join.discover.errorBody')}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void discover.refetch()}>
                {t('hub.join.discover.retry')}
              </Button>
            }
          />
        )}

        {!discover.isFetching && discover.isSuccess && centers.length === 0 && (
          <EmptyState
            icon={<SearchX className="h-5 w-5" aria-hidden="true" />}
            title={t('hub.join.discover.emptyTitle')}
            description={t('hub.join.discover.emptyBody')}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void discover.refetch()}>
                {t('hub.join.discover.retry')}
              </Button>
            }
          />
        )}

        {!discover.isFetching && discover.isSuccess && centers.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={t('hub.join.discover.listLabel')}>
            {centers.map((center) => (
              <li key={`${center.centreId}-${center.host}`}>
                <DiscoveredCenterRow center={center} onSelect={() => onPick(targetFromDiscovered(center))} />
              </li>
            ))}
          </ul>
        )}

        {showManual ? (
          <JoinManualEntry onSubmit={onPick} />
        ) : (
          <button
            type="button"
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            onClick={() => setShowManual(true)}
          >
            {t('hub.join.discover.manualToggle')}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('wizard.back')}
        </Button>
      </div>
    </div>
  );
}

function DiscoveredCenterRow({
  center,
  onSelect,
}: {
  center: DiscoveredHubView;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-start transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <span className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{center.name}</span>
        <span className="text-xs text-muted-foreground" dir="ltr">
          {center.host}:{center.port}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:scale-x-[-1]" aria-hidden="true" />
    </button>
  );
}
