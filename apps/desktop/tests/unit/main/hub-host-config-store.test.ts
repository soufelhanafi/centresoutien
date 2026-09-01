import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HubHostConfigStore,
  pickLanBindHost,
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

describe('pickLanBindHost', () => {
  const ipv4 = (address: string, internal = false) => [{ family: 'IPv4' as const, address, internal }];

  it('picks the real LAN adapter over a Docker bridge listed first (the reported join failure)', () => {
    const host = pickLanBindHost({
      docker0: ipv4('172.17.0.1'),
      'Wi-Fi': ipv4('192.168.1.42'),
    });
    expect(host).toBe('192.168.1.42');
  });

  it('skips a VirtualBox host-only adapter in favor of the real Ethernet one', () => {
    const host = pickLanBindHost({
      VirtualBoxHostOnlyNetwork: ipv4('192.168.56.1'),
      Ethernet: ipv4('10.0.0.15'),
    });
    expect(host).toBe('10.0.0.15');
  });

  it('skips a VPN tunnel adapter (WireGuard/Tailscale/ZeroTier) in favor of the real LAN one', () => {
    const host = pickLanBindHost({
      tailscale0: ipv4('100.64.0.5'),
      wg0: ipv4('10.8.0.2'),
      'Wi-Fi': ipv4('192.168.0.10'),
    });
    expect(host).toBe('192.168.0.10');
  });

  it('falls back to a virtual adapter address when it is the only private IPv4 available', () => {
    const host = pickLanBindHost({
      docker0: ipv4('172.17.0.1'),
    });
    expect(host).toBe('172.17.0.1');
  });

  it('returns null when no interface carries a private IPv4', () => {
    const host = pickLanBindHost({
      lo: ipv4('127.0.0.1', true),
      eth0: [{ family: 'IPv4', address: '203.0.113.5', internal: false }],
    });
    expect(host).toBeNull();
  });

  it('ignores non-IPv4 and internal addresses regardless of adapter name', () => {
    const host = pickLanBindHost({
      lo: ipv4('127.0.0.1', true),
      eth0: [
        { family: 'IPv6', address: 'fe80::1', internal: false },
        { family: 'IPv4', address: '192.168.1.5', internal: false },
      ],
    });
    expect(host).toBe('192.168.1.5');
  });
});
