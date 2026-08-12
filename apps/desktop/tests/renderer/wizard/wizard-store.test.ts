import { beforeEach, describe, expect, it } from 'vitest';
import { WizardStepNotSkippableError } from '@centresoutien/domain';
import { useWizardStore } from '../../../src/renderer/stores/wizard-store';

function reset() {
  useWizardStore.setState({ state: null });
}

describe('wizard store — sequencing', () => {
  beforeEach(reset);

  it('initialises the three mandatory steps with no arguments', () => {
    useWizardStore.getState().init();
    const state = useWizardStore.getState().state;
    expect(state?.steps).toEqual(['language', 'center-profile', 'admin-account']);
  });

  it('is idempotent once the user has started — a re-init never resets progress', () => {
    const store = useWizardStore.getState();
    store.init();
    store.submit(); // language committed, run now started
    const before = useWizardStore.getState().state;
    store.init(); // must be a no-op once started

    const after = useWizardStore.getState().state;
    expect(after?.currentIndex).toBe(before?.currentIndex);
    expect(after?.completed.has('language')).toBe(true);
  });
});

describe('wizard store — transitions delegate to the domain machine', () => {
  beforeEach(reset);

  it('submit advances and completes the run after the admin-account step', () => {
    const store = useWizardStore.getState();
    store.init();
    store.submit(); // language
    store.submit(); // center-profile
    store.submit(); // admin-account -> completed

    const state = useWizardStore.getState().state;
    expect(state?.status).toBe('completed');
  });

  it('skip is rejected on a mandatory step', () => {
    useWizardStore.getState().init();
    expect(() => useWizardStore.getState().skip()).toThrow(WizardStepNotSkippableError);
  });

  it('back returns to the previous step, preserving completion flags', () => {
    const store = useWizardStore.getState();
    store.init();
    store.submit(); // language committed, now on center-profile
    store.back(); // back to language
    const state = useWizardStore.getState().state;
    expect(state?.currentIndex).toBe(0);
    expect(state?.completed.has('language')).toBe(true);
  });
});
