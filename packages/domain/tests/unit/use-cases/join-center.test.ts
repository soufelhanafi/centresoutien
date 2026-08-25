import { describe, it, expect } from 'vitest';
import { JoinCenter, type JoinCenterInput } from '../../../src/use-cases/join-center';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { CenterJoinError, CenterSwitchError } from '../../../src/errors/center-errors';
import type { CenterJoinProvisioningPort } from '../../../src/ports/center-join-provisioning-port';
import type { CenterSwitchPort } from '../../../src/ports/center-switch-port';
import type { CenterCode } from '../../../src/value-objects/ids';

type RecordingProvisioner = CenterJoinProvisioningPort & {
  readonly joined: string[];
  readonly discarded: string[];
};

function recordingProvisioner(centreId = 'ctr_joined'): RecordingProvisioner {
  const joined: string[] = [];
  const discarded: string[] = [];
  return {
    joined,
    discarded,
    provisionFromHub: async ({ centerCode }) => {
      joined.push(centerCode);
      return { centreId, centerCode };
    },
    discard: async (id) => {
      discarded.push(id);
    },
  };
}

function recordingSwitcher(): CenterSwitchPort & { readonly switched: string[] } {
  const switched: string[] = [];
  return { switched, switchTo: async (centreId) => void switched.push(centreId) };
}

function validInput(overrides: Partial<JoinCenterInput> = {}): JoinCenterInput {
  return {
    baseUrl: 'http://192.168.1.20:4747',
    token: 'PAIR-CODE-1234',
    centerCode: 'CS-CASA-001',
    ...overrides,
  };
}

describe('JoinCenter', () => {
  it.each(['essentiel', 'pro', 'premium'] as const)(
    'cold-bootstraps then switches into the joined center on %s (sync.multi-device is all-tier)',
    async (planId) => {
      const provisioner = recordingProvisioner('ctr_joined');
      const switcher = recordingSwitcher();
      const useCase = new JoinCenter(new PlanPolicy(PLANS[planId]), provisioner, switcher);

      const result = await useCase.execute(validInput());

      expect(result).toEqual({ ok: true, centreId: 'ctr_joined', centerCode: 'CS-CASA-001' as CenterCode });
      expect(provisioner.joined).toEqual(['CS-CASA-001']);
      expect(switcher.switched).toEqual(['ctr_joined']);
    },
  );

  it('validates the input after the plan gate but before contacting the hub', async () => {
    const provisioner = recordingProvisioner();
    const switcher = recordingSwitcher();
    const useCase = new JoinCenter(new PlanPolicy(PLANS.pro), provisioner, switcher);

    await expect(useCase.execute(validInput({ baseUrl: 'ftp://nope' }))).rejects.toThrow();
    expect(provisioner.joined).toEqual([]);
    expect(switcher.switched).toEqual([]);
  });

  it('rejects an empty pairing token before any hub contact', async () => {
    const provisioner = recordingProvisioner();
    const useCase = new JoinCenter(new PlanPolicy(PLANS.pro), provisioner, recordingSwitcher());

    await expect(useCase.execute(validInput({ token: '' }))).rejects.toThrow();
    expect(provisioner.joined).toEqual([]);
  });

  it('never switches when the cold-bootstrap fails, so no half-joined center is opened', async () => {
    const switcher = recordingSwitcher();
    const useCase = new JoinCenter(
      new PlanPolicy(PLANS.pro),
      {
        provisionFromHub: async () => {
          throw new CenterJoinError('pairing token rejected');
        },
        discard: async () => {},
      },
      switcher,
    );

    await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(CenterJoinError);
    expect(switcher.switched).toEqual([]);
  });

  it('discards the joined replica when the switch fails, so no orphan remains', async () => {
    const provisioner = recordingProvisioner('ctr_joined');
    const useCase = new JoinCenter(new PlanPolicy(PLANS.pro), provisioner, {
      switchTo: async () => {
        throw new CenterSwitchError('target could not be opened');
      },
    });

    await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(CenterSwitchError);
    expect(provisioner.joined).toEqual(['CS-CASA-001']);
    expect(provisioner.discarded).toEqual(['ctr_joined']);
  });
});
