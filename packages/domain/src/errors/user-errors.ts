import { DomainError } from './plan-errors';

/**
 * Thrown when creating a user whose username is already taken by a live account
 * in the center. The multi-user replacement for the old single-admin
 * `AdminAccountAlreadyExistsError`: usernames are the exact per-center key.
 */
export class UsernameAlreadyTakenError extends DomainError {
  readonly code = 'username-already-taken';
  constructor(readonly username: string) {
    super(`Username "${username}" is already taken.`);
  }
}

/**
 * Thrown when first-run owner creation is attempted but an owner already exists.
 * The multi-user replacement for `AdminAccountAlreadyExistsError`: a center has
 * exactly one owner, minted once by the first-run wizard.
 */
export class OwnerAlreadyExistsError extends DomainError {
  readonly code = 'owner-already-exists';
  constructor() {
    super('An owner account already exists for this center.');
  }
}

/**
 * Thrown when a supplied role token is not one of the known {@link Role} values.
 * Fail-closed (SOU-95): an unknown role never silently becomes a privileged one.
 */
export class InvalidUserRoleError extends DomainError {
  readonly code = 'invalid-user-role';
  constructor(readonly role: string) {
    super(`"${role}" is not a valid role.`);
  }
}

/** Thrown when redeeming a setup code for a username that has no live account. */
export class UserNotFoundError extends DomainError {
  readonly code = 'user-not-found';
  constructor() {
    super('No user account exists for that username.');
  }
}

/**
 * Thrown when a setup code is wrong, or the account has no pending code to
 * redeem. Deliberately does not distinguish the two, so a caller cannot probe
 * which usernames have an outstanding invite.
 */
export class SetupCodeInvalidError extends DomainError {
  readonly code = 'setup-code-invalid';
  constructor() {
    super('The setup code is invalid.');
  }
}

/** Thrown when a setup code is presented after its expiry window has passed. */
export class SetupCodeExpiredError extends DomainError {
  readonly code = 'setup-code-expired';
  constructor() {
    super('The setup code has expired.');
  }
}

/** Thrown when a setup code has already been redeemed — single-use is enforced. */
export class SetupCodeAlreadyRedeemedError extends DomainError {
  readonly code = 'setup-code-already-redeemed';
  constructor() {
    super('The setup code has already been used.');
  }
}
