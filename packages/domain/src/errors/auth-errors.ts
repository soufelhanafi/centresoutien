import { DomainError } from './plan-errors';

/**
 * Thrown when admin-account creation is attempted but an account already exists.
 * v2 is single-admin; the first-run wizard creates exactly one account, and the
 * check has one home in the domain.
 */
export class AdminAccountAlreadyExistsError extends DomainError {
  constructor() {
    super('An admin account already exists.');
  }
}
