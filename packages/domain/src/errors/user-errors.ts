import { DomainError } from './plan-errors';
import type { PermissionFlag } from '../permissions/permissions';

// Thrown when creating a user whose username is already taken by a live account in
// the center. The multi-user replacement for the old single-admin
// `AdminAccountAlreadyExistsError`: usernames are the exact per-center key.
export class UsernameAlreadyTakenError extends DomainError {
  readonly code = 'username-already-taken';
  constructor(readonly username: string) {
    super(`Username "${username}" is already taken.`);
  }
}

// Thrown when first-run owner creation is attempted but an owner already exists.
// The multi-user replacement for `AdminAccountAlreadyExistsError`: a center has
// exactly one owner, minted once by the first-run wizard.
export class OwnerAlreadyExistsError extends DomainError {
  readonly code = 'owner-already-exists';
  constructor() {
    super('An owner account already exists for this center.');
  }
}

// Thrown when a supplied role token is not one of the known Role values.
// Fail-closed (SOU-95): an unknown role never silently becomes a privileged one.
export class InvalidUserRoleError extends DomainError {
  readonly code = 'invalid-user-role';
  constructor(readonly role: string) {
    super(`"${role}" is not a valid role.`);
  }
}

// Thrown when an employee invite requests a role that is valid but not invitable
// (owner/admin/viewer). The invite path may only mint a `secretary` — the owner is
// the director, created at first-run — so this closes the privilege-escalation gap
// where an invite could otherwise grant `owner`/`admin` and bypass the owner guard.
export class RoleNotInvitableError extends DomainError {
  readonly code = 'role-not-invitable';
  constructor(readonly role: string) {
    super(`Role "${role}" cannot be granted through an invite.`);
  }
}

// Thrown when redeeming a setup code for a username that has no live account.
export class UserNotFoundError extends DomainError {
  readonly code = 'user-not-found';
  constructor() {
    super('No user account exists for that username.');
  }
}

// Thrown when a setup code is wrong, or the account has no pending code to redeem.
// Deliberately does not distinguish the two, so a caller cannot probe which
// usernames have an outstanding invite.
export class SetupCodeInvalidError extends DomainError {
  readonly code = 'setup-code-invalid';
  constructor() {
    super('The setup code is invalid.');
  }
}

// Thrown when a setup code is presented after its expiry window has passed.
export class SetupCodeExpiredError extends DomainError {
  readonly code = 'setup-code-expired';
  constructor() {
    super('The setup code has expired.');
  }
}

// Thrown when a setup code has already been redeemed — single-use is enforced.
export class SetupCodeAlreadyRedeemedError extends DomainError {
  readonly code = 'setup-code-already-redeemed';
  constructor() {
    super('The setup code has already been used.');
  }
}

// Thrown by `requireUserPermission` when the signed-in account's per-user
// permissions don't include the flag a gated screen or channel requires. The
// per-user counterpart to `PlanFeatureUnavailableError` — same enforcement shape,
// scoped to one employee's account instead of the whole center's plan.
export class UserPermissionDeniedError extends DomainError {
  readonly code = 'user-permission-denied';
  constructor(readonly permission: PermissionFlag) {
    super(`Permission "${permission}" is not granted to this account.`);
  }
}

// Thrown when an owner's own account is the target of a permission-restriction
// write. The owner's stored `permissions` are never consulted (they always pass
// every check), so restricting them would be a silent no-op at best — rejecting
// it outright keeps the owner from believing they locked down their own access.
export class CannotRestrictOwnerError extends DomainError {
  readonly code = 'cannot-restrict-owner';
  constructor() {
    super("The owner's access cannot be restricted.");
  }
}
