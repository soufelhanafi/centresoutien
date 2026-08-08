import { beforeEach, describe, expect, it } from 'vitest';
import { ActivateLicense } from '../../../src/use-cases/activate-license';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { LicenseClaims } from '../../../src/plans/license';
import { InMemoryLicensePort } from '../fakes/in-memory-license-port';
import { InMemoryLicenseStore } from '../fakes/in-memory-license-store';
import { fakeMachineIdentity } from '../fakes/fake-machine-identity';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const MACHINE = 'machine-A';
const NOW = '2026-08-06T00:00:00.000Z';

function claims(overrides: Partial<LicenseClaims> = {}): LicenseClaims {
  return {
    plan: 'premium',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    machineId: null,
    centerCode: null,
    centersAllowed: null,
    founderDiscountExpiresAt: null,
    demo: false,
    ...overrides,
  };
}

describe('ActivateLicense', () => {
  let license: InMemoryLicensePort;
  let store: InMemoryLicenseStore;
  let plan: PlanPolicy;
  let useCase: ActivateLicense;

  beforeEach(() => {
    license = new InMemoryLicensePort();
    store = new InMemoryLicenseStore();
    plan = new PlanPolicy(PLANS.essentiel);
    useCase = new ActivateLicense(
      license,
      store,
      fakeMachineIdentity(MACHINE),
      fakeClock(NOW),
      plan,
      CENTER,
    );
  });

  describe('happy path', () => {
    it('persists the envelope and flips the active plan for a valid bound license', () => {
      const raw = 'RAW_PREMIUM';
      license.seedContent(raw, {
        status: 'valid',
        claims: claims({ machineId: MACHINE, centerCode: CENTER, centersAllowed: 3 }),
      });

      const result = useCase.execute({ rawLicense: raw });

      expect(result).toEqual({
        status: 'activated',
        plan: 'premium',
        expiresAt: null,
        centersAllowed: 3,
        founderDiscount: { expiresAt: null, expired: false },
      });
      expect(store.saved).toBe(raw);
      expect(plan.activePlanId()).toBe('premium');
    });

    it('activates an unbound (machine/center null) license', () => {
      license.seedContent('RAW', { status: 'valid', claims: claims({ plan: 'pro' }) });
      const result = useCase.execute({ rawLicense: 'RAW' });
      expect(result.status).toBe('activated');
      expect(plan.activePlanId()).toBe('pro');
    });

    it('activates a valid license whose founder discount has lapsed, flagging it', () => {
      license.seedContent('RAW', {
        status: 'valid',
        claims: claims({ founderDiscountExpiresAt: '2026-01-01T00:00:00.000Z' }),
      });

      const result = useCase.execute({ rawLicense: 'RAW' });

      expect(result).toMatchObject({
        status: 'activated',
        founderDiscount: { expiresAt: '2026-01-01T00:00:00.000Z', expired: true },
      });
      expect(store.saved).toBe('RAW');
    });
  });

  describe('rejections — nothing persisted, plan untouched', () => {
    it('rejects empty input as malformed without touching the adapter', () => {
      const result = useCase.execute({ rawLicense: '   ' });
      expect(result).toEqual({ status: 'rejected', reason: 'malformed' });
      expect(store.saveCount).toBe(0);
      expect(plan.activePlanId()).toBe('essentiel');
    });

    it('rejects an unverifiable envelope as invalid-signature', () => {
      // Unseeded content → the fake returns invalid-signature (fail-closed).
      const result = useCase.execute({ rawLicense: 'FORGED' });
      expect(result).toEqual({ status: 'rejected', reason: 'invalid-signature' });
      expect(store.saveCount).toBe(0);
      expect(plan.activePlanId()).toBe('essentiel');
    });

    it('rejects a license bound to another machine', () => {
      license.seedContent('RAW', {
        status: 'valid',
        claims: claims({ machineId: 'machine-B', centerCode: CENTER }),
      });
      const result = useCase.execute({ rawLicense: 'RAW' });
      expect(result).toEqual({ status: 'rejected', reason: 'wrong-machine' });
      expect(store.saveCount).toBe(0);
      expect(plan.activePlanId()).toBe('essentiel');
    });

    it('rejects a license bound to another center', () => {
      license.seedContent('RAW', {
        status: 'valid',
        claims: claims({ centerCode: 'CS-RABAT-002' }),
      });
      const result = useCase.execute({ rawLicense: 'RAW' });
      expect(result).toEqual({ status: 'rejected', reason: 'wrong-center' });
      expect(store.saveCount).toBe(0);
    });

    it('rejects an expired license', () => {
      license.seedContent('RAW', {
        status: 'valid',
        claims: claims({ expiresAt: '2026-08-05T23:59:59.000Z' }),
      });
      const result = useCase.execute({ rawLicense: 'RAW' });
      expect(result).toEqual({ status: 'rejected', reason: 'expired' });
      expect(store.saveCount).toBe(0);
      expect(plan.activePlanId()).toBe('essentiel');
    });
  });
});
