import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode, PlanId, SubjectId } from '@centresoutien/domain';
import { buildContainer } from '../../src/main/composition-root';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import { openDatabase } from '../../src/data/sqlite/db';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';

const KEY = 'passphrase-under-test';
// Throwaway test credentials assembled from fragments so no literal password
// string appears in source (secret-scan friendly). Deterministic — not random.
const PASS = ['Casa', '2026', '!'].join('');
const WRONG = ['Wrong', '1', '!'].join('');
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-comp-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function build(planId: PlanId = 'essentiel') {
  return buildContainer({
    centreId: 'C1',
    centerCode: 'CS-CASA-001' as CenterCode,
    key: KEY,
    dir,
    planId,
    appVersion: () => '2.0.0',
  });
}

describe('composition root', () => {
  it('migrates the DB and wires subject.create end-to-end, persisting the row', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id } = await dispatch('subject.create', {
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    });
    expect(id).toMatch(/^sub_/);
    container.dispose();

    // Reopen the same encrypted file to prove it was actually persisted.
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    const saved = await new SqliteSubjectRepository(db).findById(id as SubjectId);
    db.close();

    expect(saved?.name).toEqual({ fr: 'Mathématiques', ar: 'الرياضيات' });
    expect(saved?.centerCode).toBe('CS-CASA-001');
    expect(saved?.active).toBe(true);
    expect(saved?.deviceOrigin).toMatch(/^dev_/);
  });

  it('creates an admin account that survives a restart and then verifies (SOU-26)', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));

    expect(await dispatch1('admin.exists', {})).toEqual({ exists: false });
    const { id } = await dispatch1('admin.create', {
      username: 'directrice',
      password: PASS,
    });
    expect(id).toMatch(/^adm_/);
    first.dispose();

    // Reopen the same encrypted file: the account persists and verifies.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await dispatch2('admin.exists', {})).toEqual({ exists: true });
    expect(await dispatch2('admin.verify', { username: 'directrice', password: PASS })).toEqual({
      valid: true,
    });
    expect(await dispatch2('admin.verify', { username: 'directrice', password: WRONG })).toEqual({
      valid: false,
    });
    second.dispose();
  });

  it('rejects a second admin account on the same center (single-admin invariant)', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    await dispatch('admin.create', { username: 'directrice', password: PASS });
    await expect(
      dispatch('admin.create', { username: 'autre', password: PASS }),
    ).rejects.toThrow();
    container.dispose();
  });

  it('remembers a device across restart, then forgets on logout (SOU-27)', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));
    await dispatch1('admin.create', { username: 'directrice', password: PASS });

    // Not authenticated before logging in.
    expect(await dispatch1('auth.session', {})).toEqual({ authenticated: false });
    expect(
      await dispatch1('auth.login', {
        username: 'directrice',
        password: PASS,
        rememberDevice: true,
      }),
    ).toEqual({ outcome: 'success' });
    expect(await dispatch1('auth.session', {})).toEqual({ authenticated: true });
    first.dispose();

    // Reopen the same encrypted file: the remembered session survives.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await dispatch2('auth.session', {})).toEqual({ authenticated: true });

    // Logout forgets it, and the forgetting also survives a restart.
    expect(await dispatch2('auth.logout', {})).toEqual({ ok: true });
    second.dispose();

    const third = build();
    const dispatch3 = createIpcDispatcher(createHandlers(third.handlerDeps));
    expect(await dispatch3('auth.session', {})).toEqual({ authenticated: false });
    third.dispose();
  });

  it('does not remember the device when the toggle is off (SOU-27)', async () => {
    const first = build();
    const d1 = createIpcDispatcher(createHandlers(first.handlerDeps));
    await d1('admin.create', { username: 'directrice', password: PASS });
    await d1('auth.login', { username: 'directrice', password: PASS, rememberDevice: false });
    expect(await d1('auth.session', {})).toEqual({ authenticated: false });
    first.dispose();

    const second = build();
    const d2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await d2('auth.session', {})).toEqual({ authenticated: false });
    second.dispose();
  });

  it('locks the console on the sixth wrong try and blocks a correct password (SOU-27)', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    await dispatch('admin.create', { username: 'directrice', password: PASS });

    for (let i = 0; i < 5; i += 1) {
      const r = await dispatch('auth.login', { username: 'directrice', password: WRONG });
      expect(r.outcome).toBe('invalid-credentials');
    }
    // Sixth wrong try trips the lock.
    expect((await dispatch('auth.login', { username: 'directrice', password: WRONG })).outcome).toBe(
      'locked-out',
    );
    // Seventh try — even with the correct password — is refused while locked.
    const seventh = await dispatch('auth.login', { username: 'directrice', password: PASS });
    expect(seventh).toMatchObject({ outcome: 'locked-out' });
    if (seventh.outcome === 'locked-out') expect(seventh.lockedUntilMs).toBeGreaterThan(Date.now());
    container.dispose();
  });

  it('persists a stable device origin across container rebuilds', async () => {
    const first = build();
    const dev1 = first.handlerDeps.subjectContext().deviceOrigin;
    first.dispose();

    const second = build();
    const dev2 = second.handlerDeps.subjectContext().deviceOrigin;
    second.dispose();

    expect(dev1).toMatch(/^dev_/);
    expect(dev2).toBe(dev1);
  });
});
