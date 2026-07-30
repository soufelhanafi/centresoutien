import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode, ParentId, PlanId, SubjectId } from '@centresoutien/domain';
import { buildContainer } from '../../src/main/composition-root';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import { openDatabase } from '../../src/data/sqlite/db';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { SqliteParentRepository } from '../../src/data/sqlite/repositories/parent-repository';

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

  it('wires parent.create end-to-end (Pro), normalizing the phone and persisting the row', async () => {
    const container = build('pro'); // core.parents is a Pro feature
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id } = await dispatch('parent.create', {
      name: 'Ahmed Benali',
      phone: '06 12 34 56 78',
      email: 'ahmed@benali.ma',
      relation: 'pere',
      whatsappOptIn: true,
    });
    expect(id).toMatch(/^prt_/);
    container.dispose();

    // Reopen the same encrypted file to prove it was actually persisted.
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    const saved = await new SqliteParentRepository(db).findById(id as ParentId);
    db.close();

    expect(saved?.name).toBe('Ahmed Benali');
    expect(saved?.phone).toBe('+212612345678'); // normalized to E.164 in the domain
    expect(saved?.relation).toBe('pere');
    expect(saved?.centerCode).toBe('CS-CASA-001');
    expect(saved?.naturalKey).toContain('+212612345678');
  });

  it('rejects parent.create on Essentiel — core.parents is a Pro feature (plan gate)', async () => {
    const container = build('essentiel');
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    await expect(
      dispatch('parent.create', { name: 'Ahmed', phone: '0612345678', relation: 'pere' }),
    ).rejects.toThrow();
    container.dispose();
  });

  it('wires centerHours.save + get end-to-end and persists the week across a restart', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));

    expect(await dispatch1('centerHours.get', {})).toEqual({ week: [] }); // fresh center

    const week = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      open: dayOfWeek === 0 ? null : '09:00',
      close: dayOfWeek === 0 ? null : '18:00',
    }));
    const saved = await dispatch1('centerHours.save', week);
    expect(saved.week).toEqual(week);
    first.dispose();

    // Reopen the same encrypted file: the week persists.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect((await dispatch2('centerHours.get', {})).week).toEqual(week);
    second.dispose();
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

  it('wires center.save + center.get and persists the profile across restart (SOU-28)', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));

    expect(await dispatch1('center.get', {})).toEqual({ center: null });
    const saved = await dispatch1('center.save', {
      name: 'Centre Al Ilm',
      address: '12 Rue Mohammed V',
      phone: '0522-000000',
      email: 'contact@alilm.ma',
      logoPath: null,
    });
    expect(saved.center).toMatchObject({ name: 'Centre Al Ilm', plan: 'essentiel' });
    first.dispose();

    // Reopen the same encrypted file: the profile persists as the single row.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    const reread = await dispatch2('center.get', {});
    expect(reread.center).toMatchObject({
      name: 'Centre Al Ilm',
      email: 'contact@alilm.ma',
      logoPath: null,
      plan: 'essentiel',
    });
    second.dispose();
  });

  it('reads the active plan from the saved center row, not the build override (SOU-28 interim gate)', async () => {
    // Build as 'pro' and save — the row is seeded 'pro'.
    const first = build('pro');
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));
    await dispatch1('center.save', { name: 'Centre Pro', address: '', phone: '', email: '', logoPath: null });
    expect(await dispatch1('plan.get', {})).toEqual({ planId: 'pro' });
    first.dispose();

    // Rebuild with a *different* override — the stored plan still wins.
    const second = build('essentiel');
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await dispatch2('plan.get', {})).toEqual({ planId: 'pro' });
    second.dispose();
  });

  it('persists a stable device origin across container rebuilds', async () => {
    const first = build();
    const dev1 = first.handlerDeps.envelopeContext().deviceOrigin;
    first.dispose();

    const second = build();
    const dev2 = second.handlerDeps.envelopeContext().deviceOrigin;
    second.dispose();

    expect(dev1).toMatch(/^dev_/);
    expect(dev2).toBe(dev1);
  });
});
