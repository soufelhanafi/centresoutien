import type { MembershipRepository } from '../ports/membership-repository';
import type { Membership } from '../entities/membership';
import type { CenterCode, UserId } from '../value-objects/ids';
import { isRoleSufficient, type Role } from '../value-objects/role';
import { InsufficientRoleError, NotACenterMemberError } from '../errors/authorization-errors';

export type AuthorizeCenterAccessInput = {
  readonly userId: UserId;
  /**
   * The SELECTED center this action runs against. There is no ambient
   * "current center" global — the selected center is always passed in, so a
   * membership in another center can never silently authorize this one.
   */
  readonly centreId: CenterCode;
  readonly requiredRole: Role;
};

/**
 * Authorizes a user to act in the selected center at (or above) a required role.
 *
 * Membership is looked up strictly within the selected center via the port, so
 * the tenancy boundary is the query itself: a user whose only membership is in
 * center A gets `NotACenterMemberError` when the selected center is B — center
 * stays the tenant (CLAUDE.md §5ter). Returns the resolved {@link Membership} on
 * success so callers can read the effective role without a second lookup.
 *
 * Not plan-gated: every tier has memberships and must authorize (a single-center
 * owner included). Cross-center *consolidation* is the separate Premium
 * `org.multi-center` capability and is gated where that feature actually runs.
 */
export class AuthorizeCenterAccess {
  constructor(private readonly memberships: MembershipRepository) {}

  async execute(input: AuthorizeCenterAccessInput): Promise<Membership> {
    const membership = await this.memberships.findByUserAndCentre(input.userId, input.centreId);
    if (membership === null) {
      throw new NotACenterMemberError(input.userId, input.centreId);
    }

    // Fail-closed tenant invariant (SOU-95, Qodo): the returned row MUST belong to
    // the selected center on both its `centreId` and its envelope `centerCode`. A
    // faulty adapter or inconsistent data returning a cross-center row is denied as
    // if no membership existed — never leak that a row was found. Redundant with a
    // correct repo by design, mirroring the record-payment center cross-check.
    if (membership.centreId !== input.centreId || membership.centerCode !== input.centreId) {
      throw new NotACenterMemberError(input.userId, input.centreId);
    }

    if (!isRoleSufficient(membership.role, input.requiredRole)) {
      throw new InsufficientRoleError(input.requiredRole, membership.role);
    }

    return membership;
  }
}
