import { useTranslation } from 'react-i18next';
import { DoorOpen, Archive } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { RoomStatus, RoomView } from '../../lib/rooms/room-view';
import { RoomTable } from './room-table';

export type RoomListStatus = 'loading' | 'error' | 'empty' | 'ready';

type RoomListContentProps = {
  status: RoomListStatus;
  variant: RoomStatus;
  rooms: readonly RoomView[];
  onRetry: () => void;
  onCreate: () => void;
};

/** Renders the correct state for one rooms list: loading, error, empty, or table. */
export function RoomListContent({ status, variant, rooms, onRetry, onCreate }: RoomListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        icon={<DoorOpen className="h-5 w-5" aria-hidden="true" />}
        title={t('rooms.loadError.title')}
        description={t('rooms.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('rooms.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return variant === 'archived' ? (
      <EmptyState
        icon={<Archive className="h-5 w-5" aria-hidden="true" />}
        title={t('rooms.archivedEmpty.title')}
        description={t('rooms.archivedEmpty.body')}
      />
    ) : (
      <EmptyState
        icon={<DoorOpen className="h-5 w-5" aria-hidden="true" />}
        title={t('rooms.empty.title')}
        description={t('rooms.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('rooms.empty.cta')}
          </Button>
        }
      />
    );
  }

  return <RoomTable rooms={rooms} variant={variant} />;
}
