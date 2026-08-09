import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, Loader2 } from 'lucide-react';
import { Button, cn } from '@centresoutien/ui';
import { useCenters } from '../../hooks/center/use-centers';
import { centerGateway } from '../../lib/center/center-gateway-instance';
import { loadActivePlan } from '../../hooks/use-plan-hydration';
import { usePlanStore } from '../../stores/plan-store';
import type { CenterListItemView } from '../../lib/center/center-gateway';

/**
 * Login-time center picker (SOU-96) for a Premium user whose device holds more
 * than one local center. Sits inside the login card, before the app renders, so
 * it never uses the router. Picking a center switches the open DB (unless it is
 * already active) and re-reads that center's plan, then enters the app.
 */
export function LoginCenterSelector({ onSelected }: { onSelected: () => void }) {
  const { t } = useTranslation();
  const setPlan = usePlanStore((state) => state.setPlan);
  const centers = useCenters();
  const [pendingCentreId, setPendingCentreId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const enter = async (center: CenterListItemView) => {
    setFailed(false);
    setPendingCentreId(center.centreId);
    try {
      if (!center.isActive) {
        await centerGateway.switchTo(center.centreId);
        await loadActivePlan(setPlan);
      }
      onSelected();
    } catch {
      setFailed(true);
      setPendingCentreId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-primary">{t('centerSwitcher.login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('centerSwitcher.login.subtitle')}</p>
      </header>

      {centers.isPending ? (
        <div className="flex justify-center py-6" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={t('centerSwitcher.loading')} />
        </div>
      ) : centers.isError ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-destructive">{t('centerSwitcher.loadError')}</p>
          <Button type="button" variant="outline" onClick={() => void centers.refetch()}>
            {t('centerSwitcher.retry')}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {centers.data.map((center) => {
            const isPending = pendingCentreId === center.centreId;
            return (
              <li key={center.centreId}>
                <button
                  type="button"
                  disabled={pendingCentreId !== null}
                  onClick={() => void enter(center)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-start transition-colors',
                    'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:pointer-events-none disabled:opacity-60',
                  )}
                >
                  <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{center.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{center.centerCode}</span>
                  </span>
                  {isPending ? (
                    <Loader2 className="ms-auto h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                  ) : center.isActive ? (
                    <Check className="ms-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {failed && (
        <p role="alert" className="text-center text-sm text-destructive">
          {t('centerSwitcher.error')}
        </p>
      )}
    </div>
  );
}
