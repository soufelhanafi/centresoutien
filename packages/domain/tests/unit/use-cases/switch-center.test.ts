import { describe, it, expect } from 'vitest';
import { SwitchCenter } from '../../../src/use-cases/switch-center';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { CenterSwitchError } from '../../../src/errors/center-errors';
import type { CenterSwitchPort } from '../../../src/ports/center-switch-port';

function recordingPort(): CenterSwitchPort & { readonly switched: string[] } {
  const switched: string[] = [];
  return {
    switched,
    switchTo: async (centreId) => {
      switched.push(centreId);
    },
  };
}

describe('SwitchCenter', () => {
  it('delegates to the port and echoes the target centre on Premium (org.multi-center)', async () => {
    const port = recordingPort();
    const useCase = new SwitchCenter(new PlanPolicy(PLANS.premium), port);

    const result = await useCase.execute({ centreId: 'annex' });

    expect(result).toEqual({ ok: true, centreId: 'annex' });
    expect(port.switched).toEqual(['annex']);
  });

  it.each(['essentiel', 'pro'] as const)(
    'throws PlanFeatureUnavailableError and never touches the port on %s (no org.multi-center)',
    async (planId) => {
      const port = recordingPort();
      const useCase = new SwitchCenter(new PlanPolicy(PLANS[planId]), port);

      await expect(useCase.execute({ centreId: 'annex' })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(port.switched).toEqual([]);
    },
  );

  it('propagates a CenterSwitchError from the adapter (e.g. target unopenable)', async () => {
    const useCase = new SwitchCenter(new PlanPolicy(PLANS.premium), {
      switchTo: async () => {
        throw new CenterSwitchError('center "ghost" could not be opened');
      },
    });

    await expect(useCase.execute({ centreId: 'ghost' })).rejects.toBeInstanceOf(CenterSwitchError);
  });
});
