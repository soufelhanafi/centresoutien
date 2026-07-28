import type { ReactNode } from 'react';
import type { FeatureFlag } from '@centresoutien/domain';
import { useFeature } from '../hooks/use-feature';

type FeatureGateProps = {
  feature: FeatureFlag;
  children: ReactNode;
  fallback?: ReactNode;
};

/** Render `children` only when the active plan includes `feature`. */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  return <>{useFeature(feature) ? children : fallback}</>;
}
