import { useTranslation } from 'react-i18next';
import { Radio } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, Skeleton } from '@centresoutien/ui';
import { useFeature } from '../../../hooks/use-feature';
import { useHostingStatus } from '../../../hooks/hub/use-hosting-status';
import { HubHostingIdle } from './hub-hosting-idle';
import { HubHostingActive } from './hub-hosting-active';

/**
 * Hosting tab of the Settings page (SOU-318): turns this device into the center's
 * LAN hub so other laptops can join it. Visibility is gated on `sync.multi-device`
 * (cosmetic — the domain enforces the real gate); the card owns its own load
 * lifecycle and swaps between the idle and active views on the read.
 */
export function HubHostingCard() {
  const { t } = useTranslation();
  const hasSync = useFeature('sync.multi-device');
  const status = useHostingStatus({ enabled: hasSync });

  if (!hasSync) return null;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('hub.hosting.title')}</CardTitle>
        <CardDescription>{t('hub.hosting.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status.isPending && (
          <>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-40" />
          </>
        )}

        {status.isError && (
          <ErrorState
            icon={<Radio className="h-5 w-5" aria-hidden="true" />}
            title={t('hub.hosting.loadError')}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => status.refetch()}>
                {t('hub.hosting.retry')}
              </Button>
            }
          />
        )}

        {status.isSuccess &&
          (status.data.hosting ? (
            <HubHostingActive address={status.data.address} port={status.data.port} token={status.data.token} />
          ) : (
            <HubHostingIdle />
          ))}
      </CardContent>
    </Card>
  );
}
