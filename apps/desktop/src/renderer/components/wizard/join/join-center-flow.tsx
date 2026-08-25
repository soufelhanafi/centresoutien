import { useState } from 'react';
import { useWizardStore } from '../../../stores/wizard-store';
import { useJoinCenter } from '../../../hooks/hub/use-join-center';
import type { JoinTarget } from '../../../lib/hub/join-target';
import { JoinDiscoverStep } from './join-discover-step';
import { JoinCodeStep } from './join-code-step';
import { JoinProgressStep } from './join-progress-step';

type JoinStep = 'discover' | 'code' | 'joining';

/**
 * Orchestrates the first-run "join an existing center" branch (SOU-318):
 * discover a hub on the LAN (or enter its address by hand), read out the pairing
 * code, then join. On success main switches into the joined center and the
 * first-run gate re-renders to its login screen, unmounting this flow — so there
 * is no manual navigation here.
 */
export function JoinCenterFlow() {
  const setMode = useWizardStore((store) => store.setMode);
  const join = useJoinCenter();
  const [step, setStep] = useState<JoinStep>('discover');
  const [target, setTarget] = useState<JoinTarget | null>(null);
  const [token, setToken] = useState('');

  const startJoin = (nextToken: string, joinTarget: JoinTarget) => {
    setToken(nextToken);
    setTarget(joinTarget);
    setStep('joining');
    join.mutate({ baseUrl: joinTarget.baseUrl, token: nextToken, centerCode: joinTarget.centerCode });
  };

  if (step === 'discover') {
    return (
      <JoinDiscoverStep
        onPick={(picked) => {
          setTarget(picked);
          setStep('code');
        }}
        onBack={() => setMode('choose')}
      />
    );
  }

  if (step === 'code' && target) {
    return (
      <JoinCodeStep
        target={target}
        onBack={() => setStep('discover')}
        onConfirm={(enteredToken) => startJoin(enteredToken, target)}
      />
    );
  }

  return (
    <JoinProgressStep
      isError={join.isError}
      error={join.error}
      onRetry={() => target && startJoin(token, target)}
      onBack={() => {
        join.reset();
        setStep('code');
      }}
    />
  );
}
