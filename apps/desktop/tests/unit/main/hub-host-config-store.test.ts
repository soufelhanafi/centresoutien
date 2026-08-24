import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HubHostConfigStore,
  resolveLanBindHost,
  type HubHostConfig,
} from '../../../src/main/infra/hub-host-config-store';

let dir: string;
let store: HubHostConfigStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-hub-cfg-'));
  store = new HubHostConfigStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const CONFIG: HubHostConfig = { port: 4747, bindHost: '192.168.1.20', token: 'pair-secret' };

describe('HubHostConfigStore', () => {
  it('returns null for a center with no hosting config', () => {
    expect(store.read('local')).toBeNull();
  });

  it('round-trips a hosting config through write + read', () => {
    store.write('local', CONFIG);
    expect(store.read('local')).toEqual(CONFIG);
  });

  it('keeps configs isolated per center', () => {
    store.write('local', CONFIG);
    store.write('annexe', { port: 4848, bindHost: '10.0.0.5', token: 'other' });
    expect(store.read('local')).toEqual(CONFIG);
    expect(store.read('annexe')).toEqual({ port: 4848, bindHost: '10.0.0.5', token: 'other' });
  });

  it('overwrites an existing center config in place', () => {
    store.write('local', CONFIG);
    store.write('local', { ...CONFIG, port: 5000 });
    expect(store.read('local')?.port).toBe(5000);
  });

  it('clears one center without touching the others', () => {
    store.write('local', CONFIG);
    store.write('annexe', { port: 4848, bindHost: '10.0.0.5', token: 'other' });
    store.clear('local');
    expect(store.read('local')).toBeNull();
    expect(store.read('annexe')).not.toBeNull();
  });

  it('survives a fresh store instance (persisted to disk)', () => {
    store.write('local', CONFIG);
    expect(new HubHostConfigStore(dir).read('local')).toEqual(CONFIG);
  });

  it('treats a corrupted config file as "nothing hosted"', () => {
    writeFileSync(join(dir, 'hub-host-config.json'), '{ not json');
    expect(store.read('local')).toBeNull();
  });

  it('rejects a structurally invalid stored config (defensive validation)', () => {
    writeFileSync(
      join(dir, 'hub-host-config.json'),
      JSON.stringify({ local: { port: 70000, bindHost: '', token: '' } }),
    );
    expect(store.read('local')).toBeNull();
  });
});

describe('resolveLanBindHost', () => {
  it('returns either null or a private LAN IPv4 (never a loopback or wildcard)', () => {
    const host = resolveLanBindHost();
    if (host === null) return;
    expect(host).not.toBe('0.0.0.0');
    expect(host).not.toBe('127.0.0.1');
    // A private RFC-1918 IPv4 in dotted-quad form.
    expect(host).toMatch(/^(10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });
});
