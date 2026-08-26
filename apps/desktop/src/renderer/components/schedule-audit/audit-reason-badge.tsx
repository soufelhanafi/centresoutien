import { useTranslation } from 'react-i18next';
import { Archive, CalendarOff, Clock, DoorClosed, GraduationCap, TriangleAlert, Users, UserX } from 'lucide-react';
import { Badge, type BadgeProps } from '@centresoutien/ui';
import type { SessionAuditReason } from '../../lib/schedule-audit/stranded-session-view';

type ReasonConfig = {
  readonly variant: NonNullable<BadgeProps['variant']>;
  readonly icon: typeof Clock;
  readonly labelKey: string;
};

// Icons carry no direction, so they need no `rtl:` mirroring here. Variants follow
// severity: hard conflicts (double-book) are destructive; soft signals (hours,
// availability, over-capacity) are warning; a holiday is informational;
// an archived room is neutral.
const REASON_CONFIG: Record<SessionAuditReason, ReasonConfig> = {
  'outside-center-hours': { variant: 'warning', icon: Clock, labelKey: 'scheduleAudit.reason.outsideHours' },
  'on-holiday': { variant: 'info', icon: CalendarOff, labelKey: 'scheduleAudit.reason.holiday' },
  'outside-teacher-availability': {
    variant: 'warning',
    icon: UserX,
    labelKey: 'scheduleAudit.reason.outsideTeacherAvailability',
  },
  'teacher-double-booked': {
    variant: 'destructive',
    icon: Users,
    labelKey: 'scheduleAudit.reason.teacherDoubleBooked',
  },
  'room-double-booked': {
    variant: 'destructive',
    icon: DoorClosed,
    labelKey: 'scheduleAudit.reason.roomDoubleBooked',
  },
  'student-double-booked': {
    variant: 'destructive',
    icon: GraduationCap,
    labelKey: 'scheduleAudit.reason.studentDoubleBooked',
  },
  'room-archived': { variant: 'neutral', icon: Archive, labelKey: 'scheduleAudit.reason.roomArchived' },
  'room-over-capacity': {
    variant: 'warning',
    icon: TriangleAlert,
    labelKey: 'scheduleAudit.reason.roomOverCapacity',
  },
};

/**
 * Why a session is stranded: the reason badge for one of the SOU-296 taxonomy
 * codes (outside hours, on-holiday, teacher unavailable / double-booked,
 * room double-booked / archived / over capacity, student double-booked across
 * two group enrollments).
 */
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
