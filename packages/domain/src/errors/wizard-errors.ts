import { DomainError } from './plan-errors';
import type { WizardStepId } from '../wizard/wizard-steps';

/**
 * Thrown when a caller tries to skip a mandatory first-run step (SOU-25). This
 * is the domain-side guarantee behind "can't skip mandatory data" — the UI
 * hiding the skip control is only cosmetic.
 */
export class WizardStepNotSkippableError extends DomainError {
  constructor(readonly step: WizardStepId) {
    super(`Wizard step "${step}" is mandatory and cannot be skipped.`);
  }
}

/** Thrown when a transition is attempted on an already-completed wizard. */
export class WizardCompletedError extends DomainError {
  constructor() {
    super('The first-run wizard is already completed.');
  }
}

/** Thrown when moving back from the first step of the wizard. */
export class WizardAtFirstStepError extends DomainError {
  constructor() {
    super('The first-run wizard is already at the first step.');
  }
}
