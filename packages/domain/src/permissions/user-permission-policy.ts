import type { Role } from '../value-objects/role';
import type { PermissionFlag } from './permissions';
import { UserPermissionDeniedError } from '../errors/user-errors';

/**
 * The minimal shape the policy needs — a structural subset of {@link
 * import('../entities/user').User}, not a direct import, so this module never
 * depends on the entity (entities import PermissionFlag from here, not the other
 * way around).
 */
export type PermissionSubject = {
  readonly role: Role;
  readonly permissions: ReadonlySet<PermissionFlag>;
};

/**
 * Whether `subject` may see the screen behind `flag`. `owner` always can — an
 * owner's stored `permissions` are never consulted, so the director can never
 * accidentally lock themself out by restricting their own account.
 */
export function hasUserPermission(subject: PermissionSubject, flag: PermissionFlag): boolean {
  return subject.role === 'owner' || subject.permissions.has(flag);
}

/**
 * The enforcement surface (mirrors `PlanPolicy.require`): throws
 * `UserPermissionDeniedError` when `subject` lacks `flag`. UI hiding is cosmetic;
 * this is the only check that matters for security.
 */
export function requireUserPermission(subject: PermissionSubject, flag: PermissionFlag): void {
  if (!hasUserPermission(subject, flag)) {
    throw new UserPermissionDeniedError(flag);
  }
}
