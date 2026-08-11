import { useTranslation } from 'react-i18next';
import { Clock, CalendarOff } from 'lucide-react';
import { Badge, type BadgeProps } from '@centresoutien/ui';
import type { SessionAuditReason } from '../../lib/schedule-audit/stranded-session-view';

type ReasonConfig = {
  readonly variant: NonNullable<BadgeProps['variant']>;
  readonly icon: typeof Clock;
  readonly labelKey: string;
};

// Icons carry no direction, so they need no `rtl:` mirroring here.
const REASON_CONFIG: Record<SessionAuditReason, ReasonConfig> = {
  'outside-center-hours': { variant: 'warning', icon: Clock, labelKey: 'scheduleAudit.reason.outsideHours' },
  'on-holiday': { variant: 'info', icon: CalendarOff, labelKey: 'scheduleAudit.reason.holiday' },
};

/** Why a session is stranded: outside the center's effective hours, or on a holiday. */
export function AuditReasonBadge({ reason }: { reason: SessionAuditReason }) {
  const { t } = useTranslation();
  const { variant, icon: Icon, labelKey } = REASON_CONFIG[reason];
  return (
    <Badge variant={variant} shape="rounded">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t(labelKey)}
    </Badge>
  );
}
