import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useCenters } from '../../hooks/center/use-centers';
import { useCurrentCenter } from '../../hooks/center/use-current-center';
import { useSwitchCenter } from '../../hooks/center/use-switch-center';
import { CurrentCenterLabel } from './current-center-label';
import { CenterSwitcherMenu } from './center-switcher-menu';
import { AddCenterDialog } from './add-center-dialog';

/**
 * Header center switcher (SOU-96 + SOU-310). Premium-only via `org.multi-center`.
 * The switching dropdown keeps its SOU-96 behavior — shown only with more than one
 * center, otherwise the plain center-name label. Alongside it, a Premium operator
 * always gets an "Add a center" button (SOU-310), reachable even with a single
 * center so there is a way to grow to the second one. A non-Premium install keeps
 * exactly today's plain label with no add affordance.
 */
export function CenterSwitcher() {
  const { t } = useTranslation();
  const canMultiCenter = useFeature('org.multi-center');
  const centers = useCenters({ enabled: canMultiCenter });
  const current = useCurrentCenter({ enabled: canMultiCenter });
  const switchCenter = useSwitchCenter();
  const [addOpen, setAddOpen] = useState(false);

  const list = centers.data ?? [];
  const currentCenter = current.data;

  if (!canMultiCenter || !currentCenter) {
    return <CurrentCenterLabel />;
  }

  const requestSwitch = (centreId: string) => {
    switchCenter.mutate(centreId, {
      onError: () => toast.error(t('centerSwitcher.error')),
    });
  };

  return (
    <>
      {list.length > 1 ? (
        <CenterSwitcherMenu
          centers={list}
          current={currentCenter}
          isSwitching={switchCenter.isPending}
          onSwitch={requestSwitch}
        />
      ) : (
        <CurrentCenterLabel />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={t('centerSwitcher.add')}
        onClick={() => setAddOpen(true)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <AddCenterDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
