import type { ReactNode } from 'react';
import { useCenterProfile } from '../../hooks/center/use-center-profile';
import { useSavedLogoUrl } from '../../hooks/center/use-saved-logo-url';

type CenterLogoProps = {
  className?: string;
  /** Rendered when no logo is set (or its bytes are still loading). */
  fallback: ReactNode;
};

/**
 * The active center's logo as an `<img>` (SOU-28), or a caller-supplied fallback
 * when none is set. Reads the persisted `logoPath` from `center.get` and
 * re-hydrates its bytes over `center.logoBytes` — both react-query-cached, so
 * the sidebar and header mounting several instances share one fetch. Decorative
 * by default: the adjacent label already names the center, so `alt=""`.
 */
export function CenterLogo({ className, fallback }: CenterLogoProps) {
  const { data } = useCenterProfile();
  const logo = useSavedLogoUrl(data?.center?.logoPath ?? null);

  if (logo.url === null) return <>{fallback}</>;
  return <img src={logo.url} alt="" aria-hidden="true" className={className} />;
}
