import type { MachineIdentity } from '../../../src/ports/license-port';

/** Fixed {@link MachineIdentity} for tests — returns a stable machine id. */
export function fakeMachineIdentity(id = 'machine-test-001'): MachineIdentity {
  return { machineId: () => id };
}
