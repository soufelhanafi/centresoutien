import type { BadgeProps } from '@centresoutien/ui';
import type { ArrearsAgingBucket } from './arrears-view';

/** Escalating severity: 30 days is a nudge (info), 60 is a warning, 90+ is destructive. */
const AGING_TONE: Record<ArrearsAgingBucket, NonNullable<BadgeProps['variant']>> = {
  '30': 'info',
  '60': 'warning',
  '90+': 'destructive',
};

export function agingBadgeVariant(bucket: ArrearsAgingBucket): NonNullable<BadgeProps['variant']> {
  return AGING_TONE[bucket];
}

export function agingBucketLabelKey(bucket: ArrearsAgingBucket): string {
  return `arrears.aging.bucket.${bucket === '90+' ? 'ninetyPlus' : bucket}`;
}
