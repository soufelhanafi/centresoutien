import { SyncEngine } from '../../../src/sync/sync-engine';
import { DuplicateMatcher, type DuplicateMatchSource } from '../../../src/sync/duplicate-matcher';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import type { SyncHubPort } from '../../../src/ports/sync-hub-port';
import type { Clock } from '../../../src/ports/clock';
import { normalizeNameForMatch } from '../../../src/policies/natural-key';
import type { Parent } from '../../../src/entities/parent';
import type { Teacher } from '../../../src/entities/teacher';
import type { Student } from '../../../src/entities/student';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';

/** Shared fixtures for the sync-engine specs — same hub, two laptops, converge. */

export const CENTER = 'CS-CASA-001' as CenterCode;
export const DEV_A = 'dev_0000000000000000000000000A' as DeviceId;
export const DEV_B = 'dev_0000000000000000000000000B' as DeviceId;
export const DEV_C = 'dev_0000000000000000000000000C' as DeviceId;
export const USER_A = 'usr_0000000000000000000000000A' as UserId;
export const USER_B = 'usr_0000000000000000000000000B' as UserId;
export const USER_C = 'usr_0000000000000000000000000C' as UserId;

export const S1 = 'stu_00000000000000000000000001' as EntityId;
export const S2 = 'stu_00000000000000000000000002' as EntityId;
export const S3 = 'stu_00000000000000000000000003' as EntityId;
export const S4 = 'stu_00000000000000000000000004' as EntityId;
export const S5 = 'stu_00000000000000000000000005' as EntityId;

export const studentEntity = (id: EntityId, overrides: Record<string, unknown> = {}) => ({
  id,
  name: { fr: 'Yassine', ar: 'ياسين' },
  level: '2 Bac',
  phone: '0611111111',
  birthDate: '2010-01-15',
  ...overrides,
});

export function makeEngine(input: {
  hub: SyncHubPort;
  local: InMemorySyncLocalRepository;
  clock: Clock;
  deviceId: DeviceId;
  updatedBy: UserId;
  userCanResolve?: boolean;
  maxAttempts?: number;
  plan?: PlanPolicy;
}): SyncEngine {
  return new SyncEngine({
    hub: input.hub,
    local: input.local,
    clock: input.clock,
    plan: input.plan ?? new PlanPolicy(PLANS.premium),
    deviceId: input.deviceId,
    updatedBy: input.updatedBy,
    centreId: CENTER,
    userCanResolve: input.userCanResolve ?? true,
    ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
  });
}

export function matcherFor(local: InMemorySyncLocalRepository): DuplicateMatcher {
  const source: DuplicateMatchSource = {
    findParentsByPhone: (_c, phone) =>
      local.livePeople<Parent>('prt_').filter((p) => p.phone === phone),
    findTeachersByPhone: (_c, phone) =>
      local.livePeople<Teacher>('tch_').filter((t) => t.phone === phone),
    findStudentsByName: (_c, nameKey) =>
      local
        .livePeople<Student>('stu_')
        .filter((s) => normalizeNameForMatch(`${s.name.fr} ${s.name.ar}`) === nameKey),
  };
  return new DuplicateMatcher(source);
}
