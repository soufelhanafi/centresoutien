import { describe, it, expect } from 'vitest';
import { newCenterOwnership } from '../../../src/use-cases/seed-center-ownership';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-ANNEX-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const DIRECTOR = 'usr_00000000000000000000000009' as UserId;

function build() {
  return newCenterOwnership(
    {
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: DIRECTOR,
      directorUserId: DIRECTOR,
      organizationName: 'Centre Annexe',
      billingContact: 'contact@annexe.ma',
    },
    fakeClock('2026-08-23T10:00:00Z'),
    fakeIds(),
  );
}

describe('newCenterOwnership', () => {
  it('builds an organization with a prefixed id, the given name, and the billing contact', () => {
    const { organization } = build();

    expect(organization.id).toMatch(/^org_/);
    expect(organization.name).toBe('Centre Annexe');
    expect(organization.billingContact).toBe('contact@annexe.ma');
    expect(organization.centerCode).toBe(CENTER);
    expect(organization.deviceOrigin).toBe(DEVICE);
    expect(organization.updatedBy).toBe(DIRECTOR);
    expect(organization.createdAt).toEqual(new Date('2026-08-23T10:00:00Z'));
    expect(organization.deletedAt).toBeNull();
    expect(organization.version).toBe(0);
  });

  it("grants the director an owner membership whose centreId equals the center's own code", () => {
    const { membership } = build();

    expect(membership.id).toMatch(/^mbr_/);
    expect(membership.userId).toBe(DIRECTOR);
    expect(membership.role).toBe('owner');
    // AuthorizeCenterAccess trusts a membership only when centreId === centerCode.
    expect(membership.centreId).toBe(CENTER);
    expect(membership.centerCode).toBe(CENTER);
    expect(membership.version).toBe(0);
    expect(membership.deletedAt).toBeNull();
  });
});
