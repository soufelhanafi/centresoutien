import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { useCenterProfile } from '../../hooks/center/use-center-profile';
import { CenterLogo } from './center-logo';

/**
 * The header's plain center-name label — today's look (SOU-113). Shown whenever
 * the switcher is inactive (non-Premium, single center, or still loading), so a
 * single-center install sees exactly the same header it always had. The center's
 * logo (when set) replaces the generic building icon beside the name.
 */
export function CurrentCenterLabel() {
  const { t } = useTranslation();
  const { data } = useCenterProfile();
  const centerName = data?.center?.name ?? t('shell.currentCenter');

  return (
    <>
      <CenterLogo
        className="h-5 w-5 shrink-0 rounded-sm object-contain"
        fallback={<Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      />
      <span className="truncate text-sm font-semibold text-foreground">{centerName}</span>
    </>
  );
}
