import { beforeEach, describe, expect, it } from 'vitest';
import { PLANS, WizardStepNotSkippableError } from '@centresoutien/domain';
import { useWizardStore } from '../../../src/renderer/stores/wizard-store';

function reset() {
  useWizardStore.setState({ state: null });
}

describe('wizard store — plan-driven sequencing', () => {
  beforeEach(reset);

  it('builds four mandatory steps on Essentiel (no Holidays)', () => {
    useWizardStore.getState().init(PLANS.essentiel);
    const state = useWizardStore.getState().state;
    expect(state?.steps).toEqual(['language', 'center-profile', 'admin-account', 'hours']);
  });

  it('appends Holidays when the plan grants it (Pro)', () => {
    useWizardStore.getState().init(PLANS.pro);
    const state = useWizardStore.getState().state;
    expect(state?.steps).toContain('holidays');
    expect(state?.steps).toHaveLength(5);
  });

  it('is idempotent once the user has started — a late plan change never resets progress', () => {
    const store = useWizardStore.getState();
    store.init(PLANS.essentiel);
    store.submit(); // now started
    store.init(PLANS.pro); // would add Holidays if it re-initialised

    const state = useWizardStore.getState().state;
    expect(state?.steps).not.toContain('holidays');
    expect(state?.completed.has('language')).toBe(true);
  });
});

describe('wizard store — transitions delegate to the domain machine', () => {
  beforeEach(reset);

  it('submit advances and eventually completes the run', () => {
    const store = useWizardStore.getState();
    store.init(PLANS.essentiel);
    store.submit(); // language
    store.submit(); // center-profile
    store.submit(); // admin-account
    store.submit(); // hours -> completed

    const state = useWizardStore.getState().state;
    expect(state?.status).toBe('completed');
  });

  it('skip is rejected on a mandatory step', () => {
    useWizardStore.getState().init(PLANS.essentiel);
    expect(() => useWizardStore.getState().skip()).toThrow(WizardStepNotSkippableError);
  });

  it('skip is allowed on the optional Holidays step', () => {
    const store = useWizardStore.getState();
    store.init(PLANS.pro);
    store.submit(); // language
    store.submit(); // center-profile
    store.submit(); // admin-account
    store.submit(); // hours -> holidays (optional)
    expect(() => useWizardStore.getState().skip()).not.toThrow();
    expect(useWizardStore.getState().state?.status).toBe('completed');
  });

  it('back returns to the previous step, preserving completion flags', () => {
    const store = useWizardStore.getState();
    store.init(PLANS.essentiel);
    store.submit(); // language committed, now on center-profile
    store.back(); // back to language
    const state = useWizardStore.getState().state;
    expect(state?.currentIndex).toBe(0);
    expect(state?.completed.has('language')).toBe(true);
  });
});
