import { DomainError } from './plan-errors';

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

/**
 * Thrown when an authenticated operation is attempted without a valid session.
 * Resolves the stable `not-authenticated` code so the renderer localizes it via
 * `t(\`errors.${code}\`)` instead of surfacing the class name.
 */
export class NotAuthenticatedError extends DomainError {
  readonly code = 'not-authenticated';

  constructor() {
    super('Not authenticated.');
  }
}

