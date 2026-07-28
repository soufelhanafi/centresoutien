import { describe, expect, it } from 'vitest';
import { applyWrite } from '../../../src/entities/write';
import { newEnvelope } from '../../../src/entities/envelope';
import type { EntityEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

type Student = EntityEnvelope & {
  readonly id: string;
  fullName: string;
  level: string;
};

const center = 'CS-CASA-001' as CenterCode;
const device = 'dev_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A' as DeviceId;
const author = 'usr_A' as UserId;
const editor = 'usr_B' as UserId;

function makeStudent(clock = fakeClock('2026-07-28T10:00:00Z')): Student {
  return {
    id: 'stu_1',
    ...newEnvelope({ centerCode: center, deviceOrigin: device, updatedBy: author }, clock),
    fullName: 'Ahmed Benali',
    level: '3AC',
  };
}

describe('applyWrite', () => {
  it('applies the patch, bumps updatedAt/updatedBy, and lists changed fields', () => {
    const prev = makeStudent();
    const clock = fakeClock('2026-07-28T12:30:00Z');

    const { next, changedFields } = applyWrite(prev, { level: '4AC' }, { clock, updatedBy: editor });

    expect(next.level).toBe('4AC');
    expect(next.updatedAt).toEqual(new Date('2026-07-28T12:30:00Z'));
    expect(next.updatedBy).toBe(editor);
    expect(changedFields).toEqual(['level']);
    // untouched fields preserved
    expect(next.fullName).toBe('Ahmed Benali');
    expect(next.createdAt).toEqual(prev.createdAt);
    expect(next.version).toBe(prev.version); // version is hub-assigned, not touched locally
  });

  it('is idempotent: a no-op patch changes nothing and does NOT bump updatedAt', () => {
    const prev = makeStudent();
    const { next, changedFields } = applyWrite(
      prev,
      { level: '3AC' },
      { clock: fakeClock('2027-01-01T00:00:00Z'), updatedBy: editor },
    );

    expect(changedFields).toEqual([]);
    expect(next).toBe(prev); // same reference — no spurious sync delta
  });

  it('records every changed field when several change at once', () => {
    const prev = makeStudent();
    const { changedFields } = applyWrite(
      prev,
      { level: '4AC', fullName: 'Ahmed B.' },
      { clock: fakeClock(), updatedBy: editor },
    );
    expect(new Set(changedFields)).toEqual(new Set(['level', 'fullName']));
  });
});
