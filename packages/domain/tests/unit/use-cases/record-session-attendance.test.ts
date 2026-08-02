import { describe, it, expect } from 'vitest';
import {
  RecordSessionAttendance,
  type RecordSessionAttendanceInput,
} from '../../../src/use-cases/record-session-attendance';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { SessionNotFoundError } from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Session, SessionId } from '../../../src/entities/session';
import type { StudentId } from '../../../src/entities/student';
import type { RoomId } from '../../../src/entities/room';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import { InMemoryAttendanceRepository } from '../fakes/in-memory-attendance-repository';
import { InMemorySessionRepository } from '../fakes/in-memory-session-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SESSION_ID = 'ses_00000000000000000000000001' as SessionId;
const OTHER_SESSION_ID = 'ses_00000000000000000000000099' as SessionId;
const STUDENT_1 = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_2 = 'stu_00000000000000000000000002' as StudentId;
const ROOM_ID = 'rom_00000000000000000000000003' as RoomId;
const RECURRING_ID = 'wrs_00000000000000000000000004' as WeeklyRecurringSessionId;

const envelopeClock = fakeClock('2026-01-01T00:00:00Z');

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    recurringSessionId: RECURRING_ID,
    roomId: ROOM_ID,
    teacherId: null,
    date: '2026-09-07',
    start: '09:00',
    end: '10:00',
    ...overrides,
  };
}

function validInput(
  overrides: Partial<RecordSessionAttendanceInput> = {},
): RecordSessionAttendanceInput {
  return {
    sessionId: SESSION_ID,
    records: [
      { studentId: STUDENT_1, status: 'present' },
      { studentId: STUDENT_2, status: 'absent' },
    ],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('RecordSessionAttendance', () => {
  function build(plan: Plan) {
    const attendance = new InMemoryAttendanceRepository();
    const sessions = new InMemorySessionRepository();
    const clock = fakeClock('2026-09-07T08:00:00Z');
    const ids = fakeIds();
    const useCase = new RecordSessionAttendance(
      attendance,
      sessions,
      clock,
      ids,
      new PlanPolicy(plan),
    );
    return { useCase, attendance, sessions, clock };
  }

  it('creates a fresh record per student on first roll-call', async () => {
    const { useCase, sessions } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    const result = await useCase.execute(validInput());

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.studentId === STUDENT_1)?.status).toBe('present');
    expect(result.find((r) => r.studentId === STUDENT_2)?.status).toBe('absent');
    for (const record of result) {
      expect(record.note).toBeNull();
      expect(record.sessionId).toBe(SESSION_ID);
      expect(record.centerCode).toBe(CENTER);
      expect(record.version).toBe(0);
    }
  });

  it('persists the batch in one saveMany call, not N saves', async () => {
    const { useCase, sessions, attendance } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    await useCase.execute(validInput());

    expect(attendance.all()).toHaveLength(2);
  });

  it('edits an existing record in place on a same-day correction', async () => {
    const { useCase, sessions, clock } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    const first = await useCase.execute(validInput());
    const originalId = first.find((r) => r.studentId === STUDENT_1)?.id;
    const originalCreatedAt = first.find((r) => r.studentId === STUDENT_1)?.createdAt;

    clock.advance(60_000);
    const corrected = await useCase.execute(
      validInput({
        records: [
          { studentId: STUDENT_1, status: 'late' },
          { studentId: STUDENT_2, status: 'absent' },
        ],
      }),
    );

    const record1 = corrected.find((r) => r.studentId === STUDENT_1);
    expect(record1?.status).toBe('late');
    expect(record1?.id).toBe(originalId);
    expect(record1?.createdAt).toEqual(originalCreatedAt);
    expect(record1?.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt!.getTime());
  });

  it('does not duplicate rows when correcting a subset of the roster', async () => {
    const { useCase, sessions, attendance } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    await useCase.execute(validInput());
    await useCase.execute(
      validInput({ records: [{ studentId: STUDENT_1, status: 'excused' }] }),
    );

    expect(attendance.all()).toHaveLength(2);
    const record1 = attendance.all().find((r) => r.studentId === STUDENT_1);
    expect(record1?.status).toBe('excused');
  });

  it('rejects when the plan lacks core.attendance', async () => {
    const planWithout: Plan = {
      ...PLANS.essentiel,
      features: new Set(
        [...PLANS.essentiel.features].filter((f: FeatureFlag) => f !== 'core.attendance'),
      ),
    };
    const { useCase, sessions } = build(planWithout);
    await sessions.save(makeSession());

    await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });

  it('rejects an unknown session id', async () => {
    const { useCase } = build(PLANS.essentiel);

    await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('rejects a session belonging to another center', async () => {
    const { useCase, sessions } = build(PLANS.essentiel);
    await sessions.save(makeSession({ id: OTHER_SESSION_ID, centerCode: OTHER_CENTER }));

    await expect(
      useCase.execute(validInput({ sessionId: OTHER_SESSION_ID })),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('rejects an empty roster', async () => {
    const { useCase, sessions } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    await expect(useCase.execute(validInput({ records: [] }))).rejects.toThrow();
  });

  it('rejects a duplicate studentId within the same batch', async () => {
    const { useCase, sessions } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    await expect(
      useCase.execute(
        validInput({
          records: [
            { studentId: STUDENT_1, status: 'present' },
            { studentId: STUDENT_1, status: 'absent' },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a malformed student id', async () => {
    const { useCase, sessions } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    await expect(
      useCase.execute(validInput({ records: [{ studentId: 'not-an-id', status: 'present' }] })),
    ).rejects.toThrow();
  });

  it('rejects an invalid status', async () => {
    const { useCase, sessions } = build(PLANS.essentiel);
    await sessions.save(makeSession());

    await expect(
      useCase.execute(
        validInput({ records: [{ studentId: STUDENT_1, status: 'somewhere-else' }] }),
      ),
    ).rejects.toThrow();
  });
});
