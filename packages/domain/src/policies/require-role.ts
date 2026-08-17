import { isRoleSufficient, type Role } from '../value-objects/role';
import { InsufficientRoleError } from '../errors/authorization-errors';

// The reusable role-authorization seam (SOU-265): assert that `actual` ranks at or
// above `required`, throwing InsufficientRoleError otherwise. Unlike
// AuthorizeCenterAccess it takes an already-resolved role rather than a membership
// lookup — the caller (a main-process IPC guard) has the trusted session
// principal's role in hand and only needs the rank check.
//
// Built on isRoleSufficient, which fails closed on any non-role token, so a
// corrupt value can never out-rank `owner`. Distinct from plan gating: this is
// authorization (who), not entitlement (what tier) — never route it through
// PlanPolicy.
export function requireRole(actual: Role, required: Role): void {
  if (!isRoleSufficient(actual, required)) {
    throw new InsufficientRoleError(required, actual);
  }
}
