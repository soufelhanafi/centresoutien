import { useEffect, useState } from 'react';

/**
 * Live count of entities applied during the in-flight cold bootstrap
 * (45-minute-onboarding follow-up). `JoinProgressStep` mounts a fresh
 * instance per join attempt, so it always starts back at 0. Subscribes for
 * the lifetime of the component and detaches on unmount.
 */
export function useJoinProgress(): number {
  const [applied, setApplied] = useState(0);

  useEffect(() => {
    return window.api.onJoinProgress((event) => setApplied(event.applied));
  }, []);

  return applied;
}
