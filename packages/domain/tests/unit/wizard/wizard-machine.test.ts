import { describe, it, expect } from 'vitest';
import {
  initWizard,
  currentStep,
  isStepComplete,
  submitStep,
  skipStep,
  goToPreviousStep,
  type WizardState,
} from '../../../src/wizard/wizard-machine';
import {
  MANDATORY_STEP_IDS,
  OPTIONAL_STEP_IDS,
  type WizardStepId,
} from '../../../src/wizard/wizard-steps';
import {
  WizardAtFirstStepError,
  WizardCompletedError,
  WizardStepNotSkippableError,
} from '../../../src/errors/wizard-errors';

/** Submit steps until the wizard reports completed, returning the final state. */
function submitUntilDone(state: WizardState): WizardState {
  let s = state;
  while (s.status === 'in-progress') s = submitStep(s);
  return s;
}

describe('initWizard', () => {
  it('starts on the language step, in progress, with nothing completed', () => {
    const state = initWizard();
    expect(currentStep(state)).toBe('language');
    expect(state.currentIndex).toBe(0);
    expect(state.status).toBe('in-progress');
    expect(state.completed.size).toBe(0);
  });

  it('sequences exactly Language → Center Profile → Admin Account (SOU-235: no hours/holidays)', () => {
    const state = initWizard();
    expect(state.steps).toEqual(['language', 'center-profile', 'admin-account']);
    expect(state.steps).toEqual([...MANDATORY_STEP_IDS]);
    expect(state.steps).not.toContain('hours');
    expect(state.steps).not.toContain('holidays');
  });

  it('has no optional steps to append', () => {
    expect(OPTIONAL_STEP_IDS).toHaveLength(0);
    expect(initWizard().steps).toHaveLength(MANDATORY_STEP_IDS.length);
  });
});

describe('submitStep — forward progression', () => {
  it('walks through every mandatory step in order', () => {
    const seen: (WizardStepId | null)[] = [];
    let state = initWizard();
    for (let i = 0; i < MANDATORY_STEP_IDS.length; i++) {
      seen.push(currentStep(state));
      state = submitStep(state);
    }
    expect(seen).toEqual(['language', 'center-profile', 'admin-account']);
  });

  it('marks the submitted step complete and advances the pointer', () => {
    const state = submitStep(initWizard());
    expect(isStepComplete(state, 'language')).toBe(true);
    expect(currentStep(state)).toBe('center-profile');
    expect(state.currentIndex).toBe(1);
  });

  it('completes the wizard after the admin-account step, with no current step', () => {
    const atAdmin = submitStep(submitStep(initWizard()));
    expect(currentStep(atAdmin)).toBe('admin-account');

    const done = submitStep(atAdmin);
    expect(done.status).toBe('completed');
    expect(currentStep(done)).toBeNull();
  });

  it('reaching completed implies every mandatory step was committed', () => {
    const done = submitUntilDone(initWizard());
    for (const step of MANDATORY_STEP_IDS) {
      expect(isStepComplete(done, step)).toBe(true);
    }
  });

  it('throws WizardCompletedError when submitting a completed wizard', () => {
    const done = submitUntilDone(initWizard());
    expect(() => submitStep(done)).toThrow(WizardCompletedError);
  });
});

describe('skipStep — non-skippable enforcement', () => {
  it('rejects skipping any mandatory step and leaves the state untouched', () => {
    let state = initWizard();
    for (const step of MANDATORY_STEP_IDS) {
      expect(currentStep(state)).toBe(step);
      expect(() => skipStep(state)).toThrow(WizardStepNotSkippableError);
      expect(isStepComplete(state, step)).toBe(false);
      state = submitStep(state); // the only legal way forward
    }
  });

  it('names the offending step on the error', () => {
    const state = initWizard();
    try {
      skipStep(state);
      expect.unreachable('skipStep should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WizardStepNotSkippableError);
      expect((error as WizardStepNotSkippableError).step).toBe('language');
    }
  });

  it('throws WizardCompletedError when skipping a completed wizard', () => {
    const done = submitUntilDone(initWizard());
    expect(() => skipStep(done)).toThrow(WizardCompletedError);
  });
});

describe('goToPreviousStep — back navigation', () => {
  it('moves back one step while preserving completion flags', () => {
    const atProfile = submitStep(initWizard());
    const back = goToPreviousStep(atProfile);
    expect(currentStep(back)).toBe('language');
    expect(isStepComplete(back, 'language')).toBe(true);
  });

  it('allows back-then-forward without losing prior progress', () => {
    const atAdmin = submitStep(submitStep(initWizard()));
    const forwardAgain = submitStep(goToPreviousStep(atAdmin));
    expect(currentStep(forwardAgain)).toBe('admin-account');
    expect(isStepComplete(forwardAgain, 'center-profile')).toBe(true);
  });

  it('throws WizardAtFirstStepError on the first step', () => {
    expect(() => goToPreviousStep(initWizard())).toThrow(WizardAtFirstStepError);
  });

  it('throws WizardCompletedError once the wizard is completed', () => {
    const done = submitUntilDone(initWizard());
    expect(() => goToPreviousStep(done)).toThrow(WizardCompletedError);
  });
});

describe('immutability', () => {
  it('does not mutate the input state on submit', () => {
    const state = initWizard();
    const next = submitStep(state);
    expect(next).not.toBe(state);
    expect(state.currentIndex).toBe(0);
    expect(state.completed.size).toBe(0);
    expect(isStepComplete(state, 'language')).toBe(false);
  });

  it('does not mutate the input state on a rejected skip', () => {
    const state = initWizard();
    const snapshot = { index: state.currentIndex, completed: state.completed.size };
    expect(() => skipStep(state)).toThrow();
    expect(state.currentIndex).toBe(snapshot.index);
    expect(state.completed.size).toBe(snapshot.completed);
  });
});
