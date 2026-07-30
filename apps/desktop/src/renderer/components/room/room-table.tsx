import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { RoomStatus, RoomView } from '../../lib/rooms/room-view';
import { RoomRow } from './room-row';

const COLUMNS = ['1.6fr', '0.9fr', '0.9fr', '0.9fr', '96px'] as const;

/** The rooms list as an accessible grid-styled table (design 2i geometry). */
export function RoomTable({ rooms, variant }: { rooms: readonly RoomView[]; variant: RoomStatus }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('rooms.table.name')}</DataTableHead>
            <DataTableHead>{t('rooms.table.capacity')}</DataTableHead>
            <DataTableHead>{t('rooms.table.sessions')}</DataTableHead>
            <DataTableHead>{t('rooms.table.state')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('rooms.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} variant={variant} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
