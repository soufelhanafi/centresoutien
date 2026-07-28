import { describe, expect, it } from 'vitest';
import { newEnvelope, acceptHubVersion } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const centerCode = 'CS-CASA-001' as CenterCode;
const deviceOrigin = 'dev_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A' as DeviceId;
const user = 'usr_01JBX3ZK9P7Q8R5V6W7X8Y9Z0B' as UserId;

describe('newEnvelope', () => {
  it('stamps createdAt=updatedAt from the clock, version 0, not deleted', () => {
    const clock = fakeClock('2026-07-28T10:00:00Z');
    const env = newEnvelope({ centerCode, deviceOrigin, updatedBy: user }, clock);

    expect(env.centerCode).toBe(centerCode);
    expect(env.deviceOrigin).toBe(deviceOrigin);
    expect(env.updatedBy).toBe(user);
    expect(env.createdAt).toEqual(new Date('2026-07-28T10:00:00Z'));
    expect(env.updatedAt).toEqual(env.createdAt);
    expect(env.deletedAt).toBeNull();
    expect(env.version).toBe(0);
  });
});

describe('acceptHubVersion', () => {
  it('advances version when the hub assigns a strictly higher one', () => {
    const clock = fakeClock();
    const env = newEnvelope({ centerCode, deviceOrigin, updatedBy: user }, clock);
    const accepted = acceptHubVersion(env, 3);
    expect(accepted.version).toBe(3);
    expect(accepted.createdAt).toEqual(env.createdAt); // envelope otherwise untouched
  });

  it('is monotonic — rejects a non-increasing version', () => {
    const clock = fakeClock();
    const env = { ...newEnvelope({ centerCode, deviceOrigin, updatedBy: user }, clock), version: 5 };
    expect(() => acceptHubVersion(env, 5)).toThrow(/monotonic|version/i);
    expect(() => acceptHubVersion(env, 4)).toThrow(/monotonic|version/i);
  });
});
