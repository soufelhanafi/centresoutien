import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode, Clock } from '@centresoutien/domain';
import { buildContainer, type Container } from '../../src/main/composition-root';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import { decodeDomainError } from '../../src/shared/ipc/domain-error';

/**
 * SOU-165 / QA S4 regression, end-to-end through the composition root and the
 * `weeklySession.create` IPC channel: interactive session creation must honor an
 * active center-hours override for the slot's date, exactly like the batch
 * generator does. The clock is pinned to Monday 2026-08-10 (the E2E's system
 * date), so the current week is Sun 2026-08-09 .. Sat 2026-08-15 and a Monday
 * override governs a Monday slot. Nothing is mocked — real SQLCipher DB, real
 * repositories, real domain use cases behind the dispatcher.
 */

const KEY = 'passphrase-under-test';
const CENTER = 'CS-CASA-001' as CenterCode;
const MONDAY = 1;
const MONDAY_CLOCK: Clock = { now: () => new Date('2026-08-10T10:00:00Z') };

// Sunday..Saturday of the pinned clock's week, and a later week that does not cover it.
const CURRENT_WEEK = { start: '2026-08-09', end: '2026-08-15' };
const OTHER_WEEK = { start: '2026-09-06', end: '2026-09-12' };

function emptyWeek(): Record<string, { open: string; close: string }[]> {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function mondayWindows(...pairs: [string, string][]) {
  return { ...emptyWeek(), [MONDAY]: pairs.map(([open, close]) => ({ open, close })) };
}

let dir: string;
let container: Container;
let dispatch: ReturnType<typeof createIpcDispatcher>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cs-sou165-'));
  container = buildContainer({
    centreId: 'C1',
    centerCode: CENTER,
    key: KEY,
    dir,
    planId: 'premium',
    appVersion: () => '2.0.0',
    scheduleRestart: () => {},
    clock: MONDAY_CLOCK,
  });
  dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
});

afterEach(() => {
  container.dispose();
  rmSync(dir, { recursive: true, force: true });
});

async function seedRoom(): Promise<string> {
  const { id } = await dispatch('room.create', { name: 'Salle A', capacity: 20 });
  return id;
}

async function saveIftarOverride(dateRange: { start: string; end: string }): Promise<void> {
  await dispatch('centerHoursOverride.save', {
    dateRange,
    hoursByWeekday: mondayWindows(['14:00', '17:00'], ['21:00', '23:00']),
  });
}

async function createMondaySession(
  roomId: string,
  start: string,
  end: string,
): Promise<{ ok: true; id: string } | { ok: false; code: string | null }> {
  try {
    const { id } = await dispatch('weeklySession.create', {
      roomId,
      teacherId: null,
      groupId: null,
      dayOfWeek: MONDAY,
      start,
      end,
      active: true,
      validFrom: null,
      validTo: null,
    });
    return { ok: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ok: false, code: decodeDomainError(message)?.code ?? null };
  }
}

describe('weeklySession.create honors active center-hours overrides (SOU-165 / QA S4)', () => {
  it('rejects a Monday slot inside the iftar gap with code outside-windows (S4: 17:00–18:00 was wrongly persisted)', async () => {
    const roomId = await seedRoom();
    await saveIftarOverride(CURRENT_WEEK);

    const result = await createMondaySession(roomId, '17:00', '18:00');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, code: 'outside-windows' });

    const { sessions } = await dispatch('session.week', {});
    expect(sessions).toHaveLength(0);
  });

  it('rejects a Monday slot inside static hours but before the first override window (S4: 09:00–10:00 was wrongly created)', async () => {
    const roomId = await seedRoom();
    await saveIftarOverride(CURRENT_WEEK);

    const result = await createMondaySession(roomId, '09:00', '10:00');
    expect(result).toMatchObject({ ok: false, code: 'outside-windows' });

    const { sessions } = await dispatch('session.week', {});
    expect(sessions).toHaveLength(0);
  });

  it('accepts a Monday slot inside an override window but outside static hours (S4: 22:00–23:00 was wrongly rejected)', async () => {
    const roomId = await seedRoom();
    await saveIftarOverride(CURRENT_WEEK);

    const result = await createMondaySession(roomId, '22:00', '23:00');
    expect(result.ok).toBe(true);

    const { sessions } = await dispatch('session.week', {});
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ dayOfWeek: MONDAY, start: '22:00', end: '23:00' });
  });

  it('accepts a Monday slot fully inside an override window', async () => {
    const roomId = await seedRoom();
    await saveIftarOverride(CURRENT_WEEK);

    const result = await createMondaySession(roomId, '15:00', '16:00');
    expect(result.ok).toBe(true);
  });

  it('falls back to static hours (generic outside-hours error) on a date no active override covers', async () => {
    const roomId = await seedRoom();
    await saveIftarOverride(OTHER_WEEK); // covers a later week, not the current one

    // 22:00–23:00 is outside the static 09:00–18:00 default and no override governs today.
    const result = await createMondaySession(roomId, '22:00', '23:00');
    expect(result).toMatchObject({ ok: false, code: 'SessionOutsideCenterHoursError' });

    // ...and an in-static-hours slot is created as before, unaffected by the far-week override.
    const inHours = await createMondaySession(roomId, '10:00', '11:00');
    expect(inHours.ok).toBe(true);
  });
});
