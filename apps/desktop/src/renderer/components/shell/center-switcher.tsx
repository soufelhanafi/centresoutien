import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useCenters } from '../../hooks/center/use-centers';
import { useCurrentCenter } from '../../hooks/center/use-current-center';
import { useSwitchCenter } from '../../hooks/center/use-switch-center';
import { CurrentCenterLabel } from './current-center-label';
import { CenterSwitcherMenu } from './center-switcher-menu';

/**
 * Header center switcher (SOU-96). Premium-only via `org.multi-center` AND shown
 * only when the device holds more than one local center — otherwise it degrades
 * to the plain center-name label, so a single-center / non-Premium install keeps
 * exactly today's header. Loading and read errors also fall back to the label.
 */
export function CenterSwitcher() {
  const { t } = useTranslation();
  const canMultiCenter = useFeature('org.multi-center');
  const centers = useCenters({ enabled: canMultiCenter });
  const current = useCurrentCenter({ enabled: canMultiCenter });
  const switchCenter = useSwitchCenter();

  const list = centers.data ?? [];
  const currentCenter = current.data;

  if (!canMultiCenter || list.length <= 1 || !currentCenter) {
    return <CurrentCenterLabel />;
  }

  const requestSwitch = (centreId: string) => {
    switchCenter.mutate(centreId, {
      onError: () => toast.error(t('centerSwitcher.error')),
    });
  };

  return (
    <CenterSwitcherMenu
      centers={list}
      current={currentCenter}
      isSwitching={switchCenter.isPending}
      onSwitch={requestSwitch}
    />
  );
}
