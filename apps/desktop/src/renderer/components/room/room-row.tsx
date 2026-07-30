import { useTranslation } from 'react-i18next';
import { Badge, DataTableCell, DataTableRow, Numeric } from '@centresoutien/ui';
import type { RoomStatus, RoomView } from '../../lib/rooms/room-view';
import { RoomRowActions } from './room-row-actions';

/** One room row: name, capacity, session count (or "—"), lifecycle state, actions. */
export function RoomRow({ room, variant }: { room: RoomView; variant: RoomStatus }) {
  const { t, i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.language);

  return (
    <DataTableRow>
      <DataTableCell>
        <span className="font-medium text-foreground">{room.name}</span>
      </DataTableCell>
      <DataTableCell>
        <Numeric>{numberFormat.format(room.capacity)}</Numeric>
      </DataTableCell>
      <DataTableCell>
        {room.sessionCount === null ? (
          <span className="text-muted-foreground">{t('rooms.table.noValue')}</span>
        ) : (
          <Numeric>{numberFormat.format(room.sessionCount)}</Numeric>
        )}
      </DataTableCell>
      <DataTableCell>
        {room.archived ? (
          <Badge variant="neutral" dot>
            {t('rooms.state.archived')}
          </Badge>
        ) : (
          <Badge variant="success" dot>
            {t('rooms.state.active')}
          </Badge>
        )}
      </DataTableCell>
      <DataTableCell className="text-end">
        <RoomRowActions room={room} variant={variant} />
      </DataTableCell>
    </DataTableRow>
  );
}
