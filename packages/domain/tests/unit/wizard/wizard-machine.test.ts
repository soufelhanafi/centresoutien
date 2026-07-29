import { describe, it, expect } from 'vitest';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import {
  initWizard,
  currentStep,
  isStepComplete,
  submitStep,
  skipStep,
  goToPreviousStep,
  type WizardState,
} from '../../../src/wizard/wizard-machine';
import { MANDATORY_STEP_IDS, type WizardStepId } from '../../../src/wizard/wizard-steps';
import {
  WizardAtFirstStepError,
  WizardCompletedError,
  WizardStepNotSkippableError,
} from '../../../src/errors/wizard-errors';

// Essentiel lacks `settings.holidays`; Pro grants it — the only step-set difference.
const essentiel = new PlanPolicy(PLANS.essentiel);
const pro = new PlanPolicy(PLANS.pro);

/** Submit steps until the wizard reports completed, returning the final state. */
function submitUntilDone(state: WizardState): WizardState {
  let s = state;
  while (s.status === 'in-progress') s = submitStep(s);
  return s;
}

describe('initWizard', () => {
  it('starts on the language step, in progress, with nothing completed', () => {
    const state = initWizard(essentiel);
    expect(currentStep(state)).toBe('language');
    expect(state.currentIndex).toBe(0);
    expect(state.status).toBe('in-progress');
    expect(state.completed.size).toBe(0);
  });

  it('omits Holidays when the plan lacks settings.holidays (Essentiel)', () => {
    const state = initWizard(essentiel);
    expect(state.steps).toEqual([...MANDATORY_STEP_IDS]);
    expect(state.steps).not.toContain('holidays');
  });

  it('appends Holidays when the plan grants settings.holidays (Pro)', () => {
    const state = initWizard(pro);
    expect(state.steps).toEqual([...MANDATORY_STEP_IDS, 'holidays']);
  });
});

describe('submitStep — forward progression', () => {
  it('walks Essentiel through every mandatory step in order', () => {
    const seen: (WizardStepId | null)[] = [];
    let state = initWizard(essentiel);
    for (let i = 0; i < MANDATORY_STEP_IDS.length; i++) {
      seen.push(currentStep(state));
      state = submitStep(state);
    }
    expect(seen).toEqual(['language', 'center-profile', 'admin-account', 'hours']);
  });

  it('marks the submitted step complete and advances the pointer', () => {
    const state = submitStep(initWizard(essentiel));
    expect(isStepComplete(state, 'language')).toBe(true);
    expect(currentStep(state)).toBe('center-profile');
    expect(state.currentIndex).toBe(1);
  });

  it('completes the wizard after the last step, with no current step', () => {
    const done = submitUntilDone(initWizard(essentiel));
    expect(done.status).toBe('completed');
    expect(currentStep(done)).toBeNull();
  });

  it('reaching completed implies every mandatory step was committed', () => {
    const done = submitUntilDone(initWizard(pro));
    for (const step of MANDATORY_STEP_IDS) {
      expect(isStepComplete(done, step)).toBe(true);
    }
  });

  it('throws WizardCompletedError when submitting a completed wizard', () => {
    const done = submitUntilDone(initWizard(essentiel));
    expect(() => submitStep(done)).toThrow(WizardCompletedError);
  });
});

describe('skipStep — non-skippable enforcement', () => {
  it('rejects skipping any mandatory step and leaves the state untouched', () => {
    let state = initWizard(pro);
    for (const step of MANDATORY_STEP_IDS) {
      expect(currentStep(state)).toBe(step);
      expect(() => skipStep(state)).toThrow(WizardStepNotSkippableError);
      expect(isStepComplete(state, step)).toBe(false);
      state = submitStep(state); // the only legal way forward
    }
  });

  it('names the offending step on the error', () => {
    const state = initWizard(essentiel);
    try {
      skipStep(state);
      expect.unreachable('skipStep should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WizardStepNotSkippableError);
      expect((error as WizardStepNotSkippableError).step).toBe('language');
    }
  });

  it('allows skipping the optional Holidays step to completion', () => {
    // Advance to holidays (the 5th step on Pro), then skip it.
    let state = initWizard(pro);
    for (let i = 0; i < MANDATORY_STEP_IDS.length; i++) state = submitStep(state);
    expect(currentStep(state)).toBe('holidays');

    const done = skipStep(state);
    expect(done.status).toBe('completed');
    expect(isStepComplete(done, 'holidays')).toBe(false); // finishing with zero holidays is valid
  });

  it('throws WizardCompletedError when skipping a completed wizard', () => {
    const done = submitUntilDone(initWizard(pro));
    expect(() => skipStep(done)).toThrow(WizardCompletedError);
  });
});

describe('goToPreviousStep — back navigation', () => {
  it('moves back one step while preserving completion flags', () => {
    const atProfile = submitStep(initWizard(essentiel));
    const back = goToPreviousStep(atProfile);
    expect(currentStep(back)).toBe('language');
    expect(isStepComplete(back, 'language')).toBe(true);
  });

  it('allows back-then-forward without losing prior progress', () => {
    const atAdmin = submitStep(submitStep(initWizard(essentiel)));
    const forwardAgain = submitStep(goToPreviousStep(atAdmin));
    expect(currentStep(forwardAgain)).toBe('admin-account');
    expect(isStepComplete(forwardAgain, 'center-profile')).toBe(true);
  });

  it('throws WizardAtFirstStepError on the first step', () => {
    expect(() => goToPreviousStep(initWizard(essentiel))).toThrow(WizardAtFirstStepError);
  });

  it('throws WizardCompletedError once the wizard is completed', () => {
    const done = submitUntilDone(initWizard(essentiel));
    expect(() => goToPreviousStep(done)).toThrow(WizardCompletedError);
  });
});

describe('immutability', () => {
  it('does not mutate the input state on submit', () => {
    const state = initWizard(essentiel);
    const next = submitStep(state);
    expect(next).not.toBe(state);
    expect(state.currentIndex).toBe(0);
    expect(state.completed.size).toBe(0);
    expect(isStepComplete(state, 'language')).toBe(false);
  });

  it('does not mutate the input state on a rejected skip', () => {
    const state = initWizard(essentiel);
    const snapshot = { index: state.currentIndex, completed: state.completed.size };
    expect(() => skipStep(state)).toThrow();
    expect(state.currentIndex).toBe(snapshot.index);
    expect(state.completed.size).toBe(snapshot.completed);
  });
});
