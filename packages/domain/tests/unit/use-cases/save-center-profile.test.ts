import { describe, it, expect, beforeEach } from 'vitest';
import { SaveCenterProfile, type SaveCenterProfileInput } from '../../../src/use-cases/save-center-profile';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryCenterRepository } from '../fakes/in-memory-center-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(overrides: Partial<SaveCenterProfileInput> = {}): SaveCenterProfileInput {
  return {
    name: '  Centre Al Ilm ',
    address: ' 12 Rue Mohammed V ',
    phone: ' 0522-000000 ',
    email: ' contact@alilm.ma ',
    logoPath: null,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    seedPlan: 'essentiel',
    ...overrides,
  };
}

describe('SaveCenterProfile', () => {
  let centers: InMemoryCenterRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: SaveCenterProfile;

  beforeEach(() => {
    centers = new InMemoryCenterRepository();
    clock = fakeClock('2026-07-29T10:00:00Z');
    useCase = new SaveCenterProfile(centers, clock, fakeIds());
  });

  describe('first save (create)', () => {
    it('creates the row with a prefixed id, trimmed fields, seeded plan, and a fresh envelope', async () => {
      const center = await useCase.execute(validInput());

      expect(center.id).toMatch(/^ctr_/);
      expect(center.name).toBe('Centre Al Ilm');
      expect(center.address).toBe('12 Rue Mohammed V');
      expect(center.phone).toBe('0522-000000');
      expect(center.email).toBe('contact@alilm.ma');
      expect(center.logoPath).toBeNull();
      expect(center.plan).toBe('essentiel');
      expect(center.centerCode).toBe(CENTER);
      expect(center.deviceOrigin).toBe(DEVICE);
      expect(center.updatedBy).toBe(USER);
      expect(center.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(center.updatedAt).toEqual(center.createdAt);
      expect(center.deletedAt).toBeNull();
      expect(center.version).toBe(0);
    });

    it('persists so it reads back as the single row', async () => {
      const created = await useCase.execute(validInput());
      expect(await centers.get()).toEqual(created);
    });

    it('seeds the plan from seedPlan (pro), never from the form', async () => {
      const center = await useCase.execute(validInput({ seedPlan: 'pro' }));
      expect(center.plan).toBe('pro');
    });
  });

  describe('later save (update)', () => {
    it('patches profile fields, bumps updatedAt/updatedBy, keeps id/createdAt/plan', async () => {
      const first = await useCase.execute(validInput({ seedPlan: 'premium' }));
      clock.advance(60_000);
      const editor = 'usr_00000000000000000000000002' as UserId;

      const updated = await useCase.execute(
        validInput({ name: 'Centre Al Ilm 2', logoPath: 'logos/lgo_0001.png', updatedBy: editor, seedPlan: 'essentiel' }),
      );

      expect(updated.id).toBe(first.id);
      expect(updated.createdAt).toEqual(first.createdAt);
      expect(updated.name).toBe('Centre Al Ilm 2');
      expect(updated.logoPath).toBe('logos/lgo_0001.png');
      expect(updated.updatedAt).toEqual(new Date('2026-07-29T10:01:00Z'));
      expect(updated.updatedBy).toBe(editor);
      // plan is NOT re-seeded on update — the interim gate source stays put.
      expect(updated.plan).toBe('premium');
    });

    it('does not create a second row', async () => {
      await useCase.execute(validInput());
      await useCase.execute(validInput({ name: 'Renamed' }));
      const listed = await centers.listChangedSince(new Date(0));
      expect(listed).toHaveLength(1);
    });
  });

  describe('validation', () => {
    it('rejects a blank name', async () => {
      await expect(useCase.execute(validInput({ name: '   ' }))).rejects.toThrow();
      expect(await centers.get()).toBeNull();
    });

    it('rejects a malformed email', async () => {
      await expect(useCase.execute(validInput({ email: 'not-an-email' }))).rejects.toThrow();
    });

    it('accepts a blank email/address/phone (optional contact)', async () => {
      const center = await useCase.execute(validInput({ email: '', address: '', phone: '' }));
      expect(center.email).toBe('');
      expect(center.address).toBe('');
      expect(center.phone).toBe('');
    });
  });
});
