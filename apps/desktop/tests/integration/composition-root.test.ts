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
      password: 'Casa2026!',
    });
    expect(id).toMatch(/^adm_/);
    first.dispose();

    // Reopen the same encrypted file: the account persists and verifies.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await dispatch2('admin.exists', {})).toEqual({ exists: true });
    expect(await dispatch2('admin.verify', { username: 'directrice', password: 'Casa2026!' })).toEqual({
      valid: true,
    });
    expect(await dispatch2('admin.verify', { username: 'directrice', password: 'Wrong1!' })).toEqual({
      valid: false,
    });
    second.dispose();
  });

  it('rejects a second admin account on the same center (single-admin invariant)', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    await dispatch('admin.create', { username: 'directrice', password: 'Casa2026!' });
    await expect(
      dispatch('admin.create', { username: 'autre', password: 'Casa2026!' }),
    ).rejects.toThrow();
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
