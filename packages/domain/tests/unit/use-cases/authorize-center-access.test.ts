import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuthorizeCenterAccess,
  type AuthorizeCenterAccessInput,
} from '../../../src/use-cases/authorize-center-access';
import { newEnvelope } from '../../../src/entities/envelope';
import { MEMBERSHIP_ID_PREFIX, type Membership, type MembershipId } from '../../../src/entities/membership';
import {
  InsufficientRoleError,
  NotACenterMemberError,
} from '../../../src/errors/authorization-errors';
import type { Role } from '../../../src/value-objects/role';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryMembershipRepository } from '../fakes/in-memory-membership-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER_A = 'CS-CASA-001' as CenterCode;
const CENTER_B = 'CS-RABAT-002' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const OTHER_USER = 'usr_00000000000000000000000002' as UserId;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;

const ids = fakeIds();

function makeMembership(overrides: {
  userId?: UserId;
  centreId?: CenterCode;
  role: Role;
}): Membership {
  const centreId = overrides.centreId ?? CENTER_A;
  return {
    id: ids.next(MEMBERSHIP_ID_PREFIX) as MembershipId,
    ...newEnvelope(
      { centerCode: centreId, deviceOrigin: DEVICE, updatedBy: overrides.userId ?? USER },
      fakeClock(),
    ),
    userId: overrides.userId ?? USER,
    centreId,
    role: overrides.role,
  };
}

describe('AuthorizeCenterAccess', () => {
  let memberships: InMemoryMembershipRepository;
  let useCase: AuthorizeCenterAccess;

  beforeEach(() => {
    memberships = new InMemoryMembershipRepository();
    useCase = new AuthorizeCenterAccess(memberships);
  });

  function authorize(overrides: Partial<AuthorizeCenterAccessInput> = {}): Promise<Membership> {
    return useCase.execute({
      userId: USER,
      centreId: CENTER_A,
      requiredRole: 'viewer',
      ...overrides,
    });
  }

  describe('happy path', () => {
    it('authorizes and returns the membership when the role is sufficient in the selected center', async () => {
      const membership = makeMembership({ role: 'admin' });
      await memberships.save(membership);

      const result = await authorize({ requiredRole: 'secretary' });

      expect(result.id).toBe(membership.id);
      expect(result.role).toBe('admin');
      expect(result.centreId).toBe(CENTER_A);
    });

    it('authorizes when the role exactly meets the requirement', async () => {
      await memberships.save(makeMembership({ role: 'secretary' }));
      const result = await authorize({ requiredRole: 'secretary' });
      expect(result.role).toBe('secretary');
    });
  });

  describe('cross-center isolation (the acceptance criterion)', () => {
    it('rejects a membership in center A when the selected center is B', async () => {
      // The user's ONLY membership is an owner seat in center A...
      await memberships.save(makeMembership({ centreId: CENTER_A, role: 'owner' }));

      // ...yet acting against the selected center B must not authorize, even though
      // the role would otherwise be more than sufficient.
      await expect(
        authorize({ centreId: CENTER_B, requiredRole: 'viewer' }),
      ).rejects.toBeInstanceOf(NotACenterMemberError);
    });

    it('authorizes the same user in the center where the membership actually lives', async () => {
      await memberships.save(makeMembership({ centreId: CENTER_A, role: 'owner' }));
      await memberships.save(makeMembership({ centreId: CENTER_B, role: 'viewer' }));

      const inA = await authorize({ centreId: CENTER_A, requiredRole: 'admin' });
      expect(inA.centreId).toBe(CENTER_A);
      expect(inA.role).toBe('owner');

      // In B the same user is only a viewer — an admin action there is rejected.
      await expect(
        authorize({ centreId: CENTER_B, requiredRole: 'admin' }),
      ).rejects.toBeInstanceOf(InsufficientRoleError);
    });
  });

  describe('rejections', () => {
    it('throws NotACenterMemberError when the user has no membership at all', async () => {
      await expect(authorize()).rejects.toBeInstanceOf(NotACenterMemberError);
    });

    it('throws NotACenterMemberError for another user, even if a member exists in the center', async () => {
      await memberships.save(makeMembership({ userId: OTHER_USER, centreId: CENTER_A, role: 'owner' }));
      await expect(authorize({ userId: USER, centreId: CENTER_A })).rejects.toBeInstanceOf(
        NotACenterMemberError,
      );
    });

    it('throws InsufficientRoleError when the role ranks below the requirement', async () => {
      await memberships.save(makeMembership({ role: 'viewer' }));
      await expect(authorize({ requiredRole: 'admin' })).rejects.toBeInstanceOf(
        InsufficientRoleError,
      );
    });

    it('carries the required and actual roles on the InsufficientRoleError', async () => {
      await memberships.save(makeMembership({ role: 'secretary' }));
      await expect(authorize({ requiredRole: 'owner' })).rejects.toMatchObject({
        requiredRole: 'owner',
        actualRole: 'secretary',
      });
    });

    it('treats a revoked (soft-deleted) membership as no membership', async () => {
      const membership = makeMembership({ role: 'owner' });
      await memberships.save(membership);
      await memberships.softDelete(membership.id, new Date('2026-08-01T00:00:00Z'), USER);

      await expect(authorize({ requiredRole: 'viewer' })).rejects.toBeInstanceOf(
        NotACenterMemberError,
      );
    });
  });
});
