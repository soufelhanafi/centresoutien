import { describe, expect, it } from 'vitest';
import { orderHubCandidates, type LocalInterfaceAddress } from '../../../src/main/hub-discovery/hub-candidates';

/** The joining laptop's own Wi-Fi adapter, on the center's 192.168.1.0/24. */
const OWN_WIFI: LocalInterfaceAddress = {
  address: '192.168.1.42',
  netmask: '255.255.255.0',
  family: 'IPv4',
  internal: false,
};

const OWN_LOOPBACK: LocalInterfaceAddress = {
  address: '127.0.0.1',
  netmask: '255.0.0.0',
  family: 'IPv4',
  internal: true,
};

describe('orderHubCandidates', () => {
  it('puts an address on our own subnet first, whatever order it was advertised in', () => {
    // The reported shape of the bug: the responder listed a container bridge
    // first, so the joining laptop connected to an address the hub never bound.
    const ordered = orderHubCandidates(['172.17.0.1', '192.168.1.7'], [OWN_WIFI]);

    expect(ordered).toEqual(['192.168.1.7', '172.17.0.1']);
  });

  it('prefers our subnet over another private range the hub also advertised', () => {
    const ordered = orderHubCandidates(['10.8.0.3', '192.168.1.7'], [OWN_WIFI]);

    expect(ordered[0]).toBe('192.168.1.7');
  });

  it('drops a link-local address, which no other machine can ever reach', () => {
    // A host laptop with an unplugged Ethernet port self-assigns 169.254.x.x and
    // advertises it alongside its real Wi-Fi address. Trying it would only spend
    // a connection timeout on the joiner's first-run screen.
    const ordered = orderHubCandidates(['169.254.13.9', '192.168.1.7'], [OWN_WIFI]);

    expect(ordered).toEqual(['192.168.1.7']);
  });

  it('drops loopback and 0.0.0.0', () => {
    expect(orderHubCandidates(['127.0.0.1', '0.0.0.0', '192.168.1.7'], [OWN_WIFI])).toEqual(['192.168.1.7']);
  });

  it('ignores non-IPv4 entries such as the AAAA records advertised alongside', () => {
    expect(orderHubCandidates(['fe80::1c2d:3e4f:5a6b:7c8d', '192.168.1.7'], [OWN_WIFI])).toEqual(['192.168.1.7']);
  });

  it('keeps every plausible address rather than betting on one', () => {
    // Ranking is a preference, not a filter: if the best guess turns out to be the
    // one the hub did NOT bind, the join still has the others to try.
    const ordered = orderHubCandidates(['172.17.0.1', '10.8.0.3', '192.168.1.7'], [OWN_WIFI]);

    expect([...ordered].sort()).toEqual(['10.8.0.3', '172.17.0.1', '192.168.1.7']);
  });

  it('falls back to private-before-public when nothing shares our subnet', () => {
    const ordered = orderHubCandidates(['203.0.113.9', '10.8.0.3'], [OWN_WIFI]);

    expect(ordered).toEqual(['10.8.0.3', '203.0.113.9']);
  });

  it('preserves the advertised order among equally-ranked addresses', () => {
    const ordered = orderHubCandidates(['10.0.0.2', '10.0.0.3'], [OWN_WIFI]);

    expect(ordered).toEqual(['10.0.0.2', '10.0.0.3']);
  });

  it('deduplicates an address advertised more than once', () => {
    expect(orderHubCandidates(['192.168.1.7', '192.168.1.7'], [OWN_WIFI])).toEqual(['192.168.1.7']);
  });

  it('ignores our own internal interfaces when judging "same subnet"', () => {
    // Loopback is internal: a 127.x hub address must not rank as reachable just
    // because the joiner also has a loopback.
    expect(orderHubCandidates(['192.168.1.7'], [OWN_LOOPBACK])).toEqual(['192.168.1.7']);
  });

  it('respects a wider netmask than /24', () => {
    const own: LocalInterfaceAddress = {
      address: '10.1.2.3',
      netmask: '255.255.0.0',
      family: 'IPv4',
      internal: false,
    };

    expect(orderHubCandidates(['192.168.5.5', '10.1.99.4'], [own])[0]).toBe('10.1.99.4');
  });

  it('returns nothing when the responder advertised no usable address', () => {
    expect(orderHubCandidates([], [OWN_WIFI])).toEqual([]);
    expect(orderHubCandidates(['169.254.1.1'], [OWN_WIFI])).toEqual([]);
  });
});
