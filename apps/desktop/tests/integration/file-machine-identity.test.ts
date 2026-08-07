import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileMachineIdentity, MACHINE_ID_FILE } from '../../src/data/license/file-machine-identity';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-machine-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FileMachineIdentity', () => {
  it('generates and persists an id on first read', () => {
    const id = new FileMachineIdentity(dir).machineId();
    expect(id.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, MACHINE_ID_FILE), 'utf8')).toBe(id);
  });

  it('returns the same id across separate instances (machine-stable)', () => {
    const first = new FileMachineIdentity(dir).machineId();
    const second = new FileMachineIdentity(dir).machineId();
    expect(second).toBe(first);
  });

  it('reads an existing id rather than regenerating it', () => {
    writeFileSync(join(dir, MACHINE_ID_FILE), 'pinned-machine-id');
    expect(new FileMachineIdentity(dir).machineId()).toBe('pinned-machine-id');
  });

  it('caches within an instance so repeat calls are cheap and identical', () => {
    const identity = new FileMachineIdentity(dir);
    expect(identity.machineId()).toBe(identity.machineId());
  });
});
