import {
  WizardAtFirstStepError,
  WizardCompletedError,
  WizardStepNotSkippableError,
} from '../errors/wizard-errors';
import { MANDATORY_STEP_IDS, OPTIONAL_STEP_IDS, isMandatoryStep, type WizardStepId } from './wizard-steps';

export type WizardStatus = 'in-progress' | 'completed';

/**
 * Immutable first-run wizard state (SOU-25). `steps` is the active sequence for
 * this run — the mandatory steps, plus any granted optional steps. Every
 * transition returns a fresh state and never mutates its input. Progress is
 * ephemeral: the caller holds it in memory for the session, so quitting before
 * `completed` restarts the wizard (only committed steps, e.g. the admin account,
 * survive across launches).
 *
 * This is a pure sequencer. It owns ordering and the non-skippable guarantee; it
 * does NOT own per-step field validation — each step's own schema (SOU-28)
 * validates its data, then the caller reports success via {@link submitStep}.
 */
export type WizardState = {
  readonly steps: readonly WizardStepId[];
  readonly currentIndex: number;
  readonly completed: ReadonlySet<WizardStepId>;
  readonly status: WizardStatus;
};

/**
 * Build the initial wizard state: the mandatory steps followed by any optional
 * steps. Since SOU-235 there are no optional steps — hours and holidays moved out
 * of the wizard to Settings — so the sequence is Language → Center Profile →
 * Admin Account, and the wizard completes once the admin account is submitted.
 */
export function initWizard(): WizardState {
  const steps: WizardStepId[] = [...MANDATORY_STEP_IDS, ...OPTIONAL_STEP_IDS];
  return {
    steps,
    currentIndex: 0,
    completed: new Set<WizardStepId>(),
    status: 'in-progress',
  };
}

/** The step the wizard is currently on, or `null` once it is completed. */
export function currentStep(state: WizardState): WizardStepId | null {
  if (state.status === 'completed') return null;
  return state.steps[state.currentIndex] ?? null;
}

/** Whether a given step's data has been committed. */
export function isStepComplete(state: WizardState, step: WizardStepId): boolean {
  return state.completed.has(step);
}

/**
 * Commit the current step and advance. This is the ONLY way past a mandatory
 * step, which is what makes mandatory data non-skippable: reaching `completed`
 * implies every mandatory step was submitted. Advancing off the last step
 * completes the wizard.
 */
export function submitStep(state: WizardState): WizardState {
  const step = requireActiveStep(state);
  const completed = new Set(state.completed);
  completed.add(step);
  return advance({ ...state, completed });
}

/**
 * Advance past the current step without committing it. Legal only for optional
 * steps — mandatory steps reject with {@link WizardStepNotSkippableError}. Since
 * SOU-235 there are no optional steps, so every current step is mandatory and
 * this always rejects; the path is kept for any future optional step.
 */
export function skipStep(state: WizardState): WizardState {
  const step = requireActiveStep(state);
  if (isMandatoryStep(step)) {
    throw new WizardStepNotSkippableError(step);
  }
  return advance(state);
}

/**
 * Move back one step for review or correction. Completion flags are preserved,
 * so returning and re-submitting keeps prior data. Rejects at the first step and
 * once the wizard is completed.
 */
export function goToPreviousStep(state: WizardState): WizardState {
  if (state.status === 'completed') {
    throw new WizardCompletedError();
  }
  if (state.currentIndex === 0) {
    throw new WizardAtFirstStepError();
  }
  return { ...state, currentIndex: state.currentIndex - 1 };
}

function advance(state: WizardState): WizardState {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.steps.length) {
    return { ...state, currentIndex: state.steps.length, status: 'completed' };
  }
  return { ...state, currentIndex: nextIndex };
}

function requireActiveStep(state: WizardState): WizardStepId {
  const step = currentStep(state);
  if (step === null) {
    throw new WizardCompletedError();
  }
  return step;
}
