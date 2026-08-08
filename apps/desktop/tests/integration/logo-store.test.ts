import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IdGenerator } from '@centresoutien/domain';
import { FsLogoStore, LOGO_DIR, resolveInsideLogoDir } from '../../src/data/fs/logo-store';

let dir: string;

/** Deterministic ids so the written filename is predictable. */
function fakeIds(): IdGenerator {
  let n = 1;
  return { next: (prefix) => `${prefix}_${String(n++).padStart(26, '0')}` };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-logo-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FsLogoStore', () => {
  it('writes the bytes under app data and returns a relative, forward-slashed path', async () => {
    const store = new FsLogoStore(dir, fakeIds());
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const path = await store.save({ bytes, extension: 'png' });

    expect(path).toBe(`${LOGO_DIR}/lgo_00000000000000000000000001.png`);
    const absolute = join(dir, path);
    expect(existsSync(absolute)).toBe(true);
    expect(new Uint8Array(readFileSync(absolute))).toEqual(bytes);
  });

  it('creates the logos directory on first write and gives each logo a fresh name', async () => {
    const store = new FsLogoStore(dir, fakeIds());
    const first = await store.save({ bytes: new Uint8Array([1]), extension: 'jpg' });
    const second = await store.save({ bytes: new Uint8Array([2]), extension: 'jpg' });
    expect(first).not.toBe(second);
    expect(existsSync(join(dir, LOGO_DIR))).toBe(true);
  });

  it('reads back the bytes of a previously saved logo', async () => {
    const store = new FsLogoStore(dir, fakeIds());
    const bytes = new Uint8Array([10, 20, 30]);
    const path = await store.save({ bytes, extension: 'png' });

    expect(await store.read(path)).toEqual(bytes);
  });

  it('returns null for a path that was never written', async () => {
    const store = new FsLogoStore(dir, fakeIds());
    expect(await store.read('logos/lgo_missing.png')).toBeNull();
  });

  it('refuses path traversal and absolute paths, returning null', async () => {
    const store = new FsLogoStore(dir, fakeIds());
    // Plant a secret next to the logo dir; none of these references may reach it.
    writeFileSync(join(dir, 'secret.txt'), 'top secret');

    expect(await store.read('logos/../secret.txt')).toBeNull();
    expect(await store.read('../secret.txt')).toBeNull();
    expect(await store.read('logos/../../etc/hosts')).toBeNull();
    expect(await store.read(join(dir, 'secret.txt'))).toBeNull(); // absolute
    expect(await store.read('')).toBeNull();
  });
});

describe('resolveInsideLogoDir (SOU-110 m1 — shared read + wipe guard)', () => {
  it('resolves a legitimate in-dir logo reference to an absolute path', () => {
    const resolved = resolveInsideLogoDir(dir, 'logos/lgo_00000000000000000000000001.png');
    expect(resolved).toBe(join(dir, LOGO_DIR, 'lgo_00000000000000000000000001.png'));
  });

  it('returns null for traversal, absolute, and empty references so a poisoned logo_path can never delete an outside file', () => {
    expect(resolveInsideLogoDir(dir, 'logos/../secret.txt')).toBeNull();
    expect(resolveInsideLogoDir(dir, '../secret.txt')).toBeNull();
    expect(resolveInsideLogoDir(dir, 'logos/../../etc/hosts')).toBeNull();
    expect(resolveInsideLogoDir(dir, join(dir, 'secret.txt'))).toBeNull();
    expect(resolveInsideLogoDir(dir, '')).toBeNull();
  });
});
