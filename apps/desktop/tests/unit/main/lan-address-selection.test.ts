import { describe, expect, it } from 'vitest';
import {
  isPreferredLanAddressIn,
  pickLanBindHost,
  resolveLanBindHost,
} from '../../../src/main/infra/lan-address-selection';

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

describe('isPreferredLanAddressIn', () => {
  const ipv4 = (address: string, internal = false) => [{ family: 'IPv4' as const, address, internal }];

  it('accepts an address on a real LAN adapter', () => {
    expect(isPreferredLanAddressIn({ 'Wi-Fi': ipv4('192.168.1.42') }, '192.168.1.42')).toBe(true);
  });

  // The reason boot re-resolves on more than liveness: a bindHost chosen before
  // the virtual-adapter denylist existed stays live for as long as Docker/the VPN
  // is installed, so a liveness-only check would serve an unreachable address
  // forever and never heal.
  it('rejects a live address that sits on a virtual adapter', () => {
    const interfaces = { docker0: ipv4('172.17.0.1'), 'Wi-Fi': ipv4('192.168.1.42') };

    expect(isPreferredLanAddressIn(interfaces, '172.17.0.1')).toBe(false);
  });

  it('rejects a VPN tunnel address', () => {
    expect(isPreferredLanAddressIn({ tailscale0: ipv4('100.101.102.103') }, '100.101.102.103')).toBe(false);
  });

  it('rejects an address that no longer exists on this machine', () => {
    expect(isPreferredLanAddressIn({ 'Wi-Fi': ipv4('192.168.1.42') }, '192.168.9.9')).toBe(false);
  });

  it('rejects a non-private address even on a real adapter', () => {
    expect(isPreferredLanAddressIn({ eth0: ipv4('203.0.113.5') }, '203.0.113.5')).toBe(false);
  });

  it('rejects an internal (loopback) address', () => {
    expect(isPreferredLanAddressIn({ lo: ipv4('127.0.0.1', true) }, '127.0.0.1')).toBe(false);
  });

  it('accepts either address on a machine with two real adapters, so a written-down pairing address is not moved', () => {
    const interfaces = { eth0: ipv4('192.168.1.10'), 'Wi-Fi': ipv4('192.168.1.42') };

    expect(isPreferredLanAddressIn(interfaces, '192.168.1.10')).toBe(true);
    expect(isPreferredLanAddressIn(interfaces, '192.168.1.42')).toBe(true);
  });
});
