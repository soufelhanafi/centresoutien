import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HubClientConfigStore,
  type HubClientConfig,
} from '../../../src/main/infra/hub-client-config-store';

let dir: string;
let store: HubClientConfigStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-hub-client-'));
  store = new HubClientConfigStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const CONFIG: HubClientConfig = { baseUrl: 'http://192.168.1.20:4747', token: 'pair-secret' };

describe('HubClientConfigStore', () => {
  it('returns null for a center that has not joined a hub', () => {
    expect(store.read('local')).toBeNull();
  });

  it('round-trips a client config through write + read', () => {
    store.write('joined-1', CONFIG);
    expect(store.read('joined-1')).toEqual(CONFIG);
  });

  it('keeps configs isolated per center', () => {
    store.write('joined-1', CONFIG);
    store.write('joined-2', { baseUrl: 'https://10.0.0.5:5252', token: 'other' });
    expect(store.read('joined-1')).toEqual(CONFIG);
    expect(store.read('joined-2')).toEqual({ baseUrl: 'https://10.0.0.5:5252', token: 'other' });
  });

  it('clears one center without touching the others', () => {
    store.write('joined-1', CONFIG);
    store.write('joined-2', { baseUrl: 'https://10.0.0.5:5252', token: 'other' });
    store.clear('joined-1');
    expect(store.read('joined-1')).toBeNull();
    expect(store.read('joined-2')).not.toBeNull();
  });

  it('survives a fresh store instance (persisted to disk)', () => {
    store.write('joined-1', CONFIG);
    expect(new HubClientConfigStore(dir).read('joined-1')).toEqual(CONFIG);
  });

  it('treats a corrupted config file as "no hub joined"', () => {
    writeFileSync(join(dir, 'hub-client-config.json'), 'not json at all');
    expect(store.read('joined-1')).toBeNull();
  });

  it('rejects a stored config whose URL is not http(s)', () => {
    writeFileSync(
      join(dir, 'hub-client-config.json'),
      JSON.stringify({ 'joined-1': { baseUrl: 'ftp://x', token: 't' } }),
    );
    expect(store.read('joined-1')).toBeNull();
  });

  it('rejects a stored config with an empty token', () => {
    writeFileSync(
      join(dir, 'hub-client-config.json'),
      JSON.stringify({ 'joined-1': { baseUrl: 'http://192.168.1.20:4747', token: '' } }),
    );
    expect(store.read('joined-1')).toBeNull();
  });
});
