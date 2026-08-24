import { describe, it, expect } from 'vitest';
import { CreateCenter, type CreateCenterInput } from '../../../src/use-cases/create-center';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { CenterProvisioningError } from '../../../src/errors/center-errors';
import type { CenterProvisioningPort } from '../../../src/ports/center-provisioning-port';
import type { CenterSwitchPort } from '../../../src/ports/center-switch-port';
import type { CenterCode } from '../../../src/value-objects/ids';

type RecordingProvisioner = CenterProvisioningPort & { readonly provisioned: string[] };

function recordingProvisioner(centreId = 'ctr_new'): RecordingProvisioner {
  const provisioned: string[] = [];
  return {
    provisioned,
    provision: async ({ profile }) => {
      provisioned.push(profile.name);
      return { centreId, centerCode: `CS-${centreId}` as CenterCode };
    },
  };
}

function recordingSwitcher(): CenterSwitchPort & { readonly switched: string[] } {
  const switched: string[] = [];
  return { switched, switchTo: async (centreId) => void switched.push(centreId) };
}

function validInput(overrides: Partial<CreateCenterInput['profile']> = {}): CreateCenterInput {
  return {
    profile: {
      name: '  Centre Annexe ',
      address: '',
      phone: '',
      email: '',
      ...overrides,
    },
  };
}

describe('CreateCenter', () => {
  it('provisions then switches into the new center on Premium (org.multi-center)', async () => {
    const provisioner = recordingProvisioner('ctr_annex');
    const switcher = recordingSwitcher();
    const useCase = new CreateCenter(new PlanPolicy(PLANS.premium), provisioner, switcher);

    const result = await useCase.execute(validInput());

    expect(result).toEqual({ ok: true, centreId: 'ctr_annex', centerCode: 'CS-ctr_annex' });
    expect(provisioner.provisioned).toEqual(['Centre Annexe']);
    expect(switcher.switched).toEqual(['ctr_annex']);
  });

  it.each(['essentiel', 'pro'] as const)(
    'throws PlanFeatureUnavailableError and never provisions or switches on %s',
    async (planId) => {
      const provisioner = recordingProvisioner();
      const switcher = recordingSwitcher();
      const useCase = new CreateCenter(new PlanPolicy(PLANS[planId]), provisioner, switcher);

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(provisioner.provisioned).toEqual([]);
      expect(switcher.switched).toEqual([]);
    },
  );

  it('validates the profile after the plan gate but before provisioning', async () => {
    const provisioner = recordingProvisioner();
    const switcher = recordingSwitcher();
    const useCase = new CreateCenter(new PlanPolicy(PLANS.premium), provisioner, switcher);

    await expect(useCase.execute(validInput({ name: '   ' }))).rejects.toThrow();
    expect(provisioner.provisioned).toEqual([]);
    expect(switcher.switched).toEqual([]);
  });

  it('never switches when provisioning fails, so no half-created center is opened', async () => {
    const switcher = recordingSwitcher();
    const useCase = new CreateCenter(
      new PlanPolicy(PLANS.premium),
      { provision: async () => { throw new CenterProvisioningError('disk full'); } },
      switcher,
    );

    await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(CenterProvisioningError);
    expect(switcher.switched).toEqual([]);
  });
});
