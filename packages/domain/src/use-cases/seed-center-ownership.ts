import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { UserId } from '../value-objects/ids';
import { newEnvelope, type NewEnvelopeInput } from '../entities/envelope';
import {
  ORGANIZATION_ID_PREFIX,
  type Organization,
  type OrganizationId,
} from '../entities/organization';
import {
  MEMBERSHIP_ID_PREFIX,
  type Membership,
  type MembershipId,
} from '../entities/membership';

/** The owning Organization plus the director's owner Membership for a new center. */
export type CenterOwnership = {
  readonly organization: Organization;
  readonly membership: Membership;
};

export type NewCenterOwnershipInput = NewEnvelopeInput & {
  /** The signed-in director who created the center — the Membership's subject. */
  directorUserId: UserId;
  organizationName: string;
  billingContact: string;
};

/**
 * Builds the ownership rows a center is created with (SOU-310, SOU-95): one
 * Organization (the authorization + billing-contact layer) and the director's
 * `owner` Membership binding them to this center.
 *
 * The Membership's `centreId` is the center's own `centerCode` — in the
 * one-DB-per-center model they are the same tenant, and keeping them equal is
 * exactly what `AuthorizeCenterAccess` asserts before trusting a membership. Pure —
 * the caller commits the rows atomically with the rest of the center setup.
 */
export function newCenterOwnership(
  input: NewCenterOwnershipInput,
  clock: Clock,
  ids: IdGenerator,
): CenterOwnership {
  const envelope: NewEnvelopeInput = {
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    updatedBy: input.updatedBy,
  };
  const organization: Organization = {
    id: ids.next(ORGANIZATION_ID_PREFIX) as OrganizationId,
    ...newEnvelope(envelope, clock),
    name: input.organizationName,
    billingContact: input.billingContact,
  };
  const membership: Membership = {
    id: ids.next(MEMBERSHIP_ID_PREFIX) as MembershipId,
    ...newEnvelope(envelope, clock),
    userId: input.directorUserId,
    centreId: input.centerCode,
    role: 'owner',
  };
  return { organization, membership };
}
