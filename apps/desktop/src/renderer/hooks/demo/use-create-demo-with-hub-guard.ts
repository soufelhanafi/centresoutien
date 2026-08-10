import { useState } from 'react';
import { useCreateDemo } from './use-create-demo';
import { useDemoStatus } from './use-demo-status';

/**
 * Shared guard for the three demo-create entry points (SOU-190): when the open
 * real center is served by a laptop that is ALSO the LAN hub host, `demo.create`
 * silently stops the embedded hub and cuts off teammates' sync. `requestCreate`
 * opens the confirmation dialog instead of mutating directly; `confirmCreate`
 * proceeds (the hub still stops — the warning only makes it explicit). Exposes
 * the underlying `create` mutation and `status` query so each screen keeps
 * composing its own pending/error/loading states.
 */
export function useCreateDemoWithHubGuard() {
  const create = useCreateDemo();
  const status = useDemoStatus();
  const [hubWarnOpen, setHubWarnOpen] = useState(false);

  const requestCreate = () => {
    if (status.data?.isHubHost === true) {
      setHubWarnOpen(true);
      return;
    }
    create.mutate();
  };

  const confirmCreate = () => {
    setHubWarnOpen(false);
    create.mutate();
  };

  return { create, status, hubWarnOpen, setHubWarnOpen, requestCreate, confirmCreate };
}
