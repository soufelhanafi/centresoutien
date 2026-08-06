import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLANS } from '@centresoutien/domain';
import { useOptionalFeature } from '../../src/renderer/hooks/use-feature';
import { usePlanStore } from '../../src/renderer/stores/plan-store';

beforeEach(() => {
  usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
});

describe('useOptionalFeature', () => {
  it('returns true for an ungated module (flag undefined)', () => {
    const { result } = renderHook(() => useOptionalFeature(undefined));
    expect(result.current).toBe(true);
  });

  it('returns false when the active plan lacks the flag', () => {
    // org.multi-center is the only flag not granted by every live tier (SOU-83 collapse).
    const { result } = renderHook(() => useOptionalFeature('org.multi-center'));
    expect(result.current).toBe(false);
  });

  it('tracks plan switches live', () => {
    const { result } = renderHook(() => useOptionalFeature('org.multi-center'));
    expect(result.current).toBe(false);

    act(() => {
      usePlanStore.getState().setPlan('premium');
    });

    expect(result.current).toBe(true);
  });
});
