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

/**
 * Thrown when a password change is attempted but no admin account exists yet.
 * Defensive only — the settings screen that calls this sits behind login, so
 * this guards a corrupted or wiped local database, not a normal path.
 */
export class AdminAccountNotFoundError extends DomainError {
  constructor() {
    super('No admin account exists.');
  }
}

/** Thrown when a password change supplies a `currentPassword` that doesn't verify. */
export class InvalidCurrentPasswordError extends DomainError {
  constructor() {
    super('The current password is incorrect.');
  }
}

/** Thrown when no recovery codes exist for the admin account. */
export class NoRecoveryCodesError extends DomainError {
  constructor() {
    super('No recovery codes exist for this account.');
  }
}

/** Thrown when a recovery code is invalid (not found or already consumed). */
export class InvalidRecoveryCodeError extends DomainError {
  constructor() {
    super('The recovery code is invalid or has already been used.');
  }
}

/** Thrown when an authenticated operation is attempted without a valid session. */
export class NotAuthenticatedError extends DomainError {
  constructor() {
    super('Not authenticated.');
  }
}

/** Thrown when the security-questions reset path is used before any questions have been set. */
export class NoSecurityQuestionsSetError extends DomainError {
  constructor() {
    super('No security questions have been set for this account.');
  }
}
