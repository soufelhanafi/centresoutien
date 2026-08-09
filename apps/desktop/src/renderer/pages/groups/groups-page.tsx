import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  Button,
  LockOverlay,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useGroupOptions } from '../../hooks/group/use-group-options';
import { GroupListToolbar } from '../../components/group/group-list-toolbar';
import { GroupListPanel } from '../../components/group/group-list-panel';
import { CreateGroupSheet } from '../../components/group/create-group-sheet';
import { EMPTY_GROUP_FILTERS, type GroupFilters } from '../../components/group/group-filters';

/** Groups module: active / archived lists with subject/level/kind filters, create, edit, archive, restore. */
export function GroupsPage() {
  const { t } = useTranslation();
  const groupsEnabled = useFeature('core.groups');
  const upgradeCta = useUpgradeCta('core.groups');
  const [filters, setFilters] = useState<GroupFilters>(EMPTY_GROUP_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);
  const subjects = useGroupOptions().data?.subjects ?? [];

  if (!groupsEnabled) {
    return (
      <section aria-labelledby="groups-title" className="mx-auto flex w-full max-w-5xl flex-col">
        <h1 id="groups-title" className="text-xl font-semibold text-foreground">
          {t('groups.title')}
        </h1>
        <div className="mt-6">
          <LockOverlay
            title={t('groups.title')}
            description={t('plan.locked')}
            ctaLabel={upgradeCta.ctaLabel}
            onCta={upgradeCta.onCta}
            className="w-full max-w-md"
          >
            <div className="p-8 text-sm text-muted-foreground">{t('groups.subtitle')}</div>
          </LockOverlay>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="groups-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="groups-title" className="text-xl font-semibold text-foreground">
            {t('groups.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('groups.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('groups.new')}
        </Button>
      </header>

      <GroupListToolbar filters={filters} onChange={setFilters} subjects={subjects} />

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">{t('groups.tabs.active')}</TabsTrigger>
          <TabsTrigger value="archived">{t('groups.tabs.archived')}</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <GroupListPanel variant="active" filters={filters} onCreate={openCreate} />
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          <GroupListPanel variant="archived" filters={filters} onCreate={openCreate} />
        </TabsContent>
      </Tabs>

      <CreateGroupSheet open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
