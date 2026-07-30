import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { RoomListPanel } from '../../components/room/room-list-panel';
import { CreateRoomDialog } from '../../components/room/create-room-dialog';

/** Rooms module: active / archived tables with create, edit, archive, restore. */
export function RoomsPage() {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);

  return (
    <section aria-labelledby="rooms-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="rooms-title" className="text-xl font-semibold text-foreground">
            {t('rooms.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('rooms.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('rooms.new')}
        </Button>
      </header>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">{t('rooms.tabs.active')}</TabsTrigger>
          <TabsTrigger value="archived">{t('rooms.tabs.archived')}</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <RoomListPanel variant="active" onCreate={openCreate} />
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          <RoomListPanel variant="archived" onCreate={openCreate} />
        </TabsContent>
      </Tabs>

      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
