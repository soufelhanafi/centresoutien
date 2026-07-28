import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLANS } from '@centresoutien/domain';
import { FeatureGate } from '../../src/renderer/components/feature-gate';
import { usePlanStore } from '../../src/renderer/stores/plan-store';

beforeEach(() => {
  usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
});

function GatedDemo() {
  return (
    <FeatureGate feature="sync.multi-device" fallback={<span>locked</span>}>
      <span>unlocked</span>
    </FeatureGate>
  );
}

describe('FeatureGate + plan store', () => {
  it('hides gated content on a plan without the feature', () => {
    render(<GatedDemo />);
    expect(screen.getByText('locked')).toBeInTheDocument();
    expect(screen.queryByText('unlocked')).not.toBeInTheDocument();
  });

  it('toggles gated UI live when the plan switches (dev tools)', async () => {
    render(<GatedDemo />);
    expect(screen.getByText('locked')).toBeInTheDocument();

    act(() => {
      usePlanStore.getState().setPlan('premium');
    });

    expect(await screen.findByText('unlocked')).toBeInTheDocument();
    expect(screen.queryByText('locked')).not.toBeInTheDocument();
  });
});
