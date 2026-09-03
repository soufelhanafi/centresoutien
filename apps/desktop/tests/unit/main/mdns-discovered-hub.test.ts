import { describe, expect, it } from 'vitest';
import type { Service } from 'bonjour-service';
import { toDiscoveredHub } from '../../../src/main/hub-discovery/mdns-adapters';
import type { LocalInterfaceAddress } from '../../../src/main/hub-discovery/hub-candidates';

const OWN_WIFI: LocalInterfaceAddress = {
  address: '192.168.1.42',
  netmask: '255.255.255.0',
  family: 'IPv4',
  internal: false,
};

/** A responder as `bonjour-service` hands it to the browse callback. Only the
 *  fields the narrowing reads are set; the cast keeps the fixture to those. */
function responder(overrides: Partial<Service> = {}): Service {
  return {
    name: 'Centre Al Ilm',
    port: 4747,
    host: 'director-laptop.local',
    addresses: ['192.168.1.7'],
    txt: { centreId: 'local', centerCode: 'CS-CASA-001', name: 'Centre Al Ilm' },
    ...overrides,
  } as Service;
}

describe('toDiscoveredHub', () => {
  it('carries every advertised address, best first, with `host` as the best one', () => {
    // The responder listed the container bridge first; the joining laptop must
    // still lead with the address on its own network.
    const hub = toDiscoveredHub(responder({ addresses: ['172.17.0.1', '192.168.1.7'] }), [OWN_WIFI]);

    expect(hub?.host).toBe('192.168.1.7');
    expect(hub?.hosts).toEqual(['192.168.1.7', '172.17.0.1']);
  });

  it('falls back to the SRV target name when no usable IPv4 was advertised', () => {
    const hub = toDiscoveredHub(responder({ addresses: ['169.254.4.4'] }), [OWN_WIFI]);

    expect(hub?.hosts).toEqual(['director-laptop.local']);
  });

  it('skips a responder whose TXT identity is missing or foreign', () => {
    expect(toDiscoveredHub(responder({ txt: { name: 'something else' } }), [OWN_WIFI])).toBeNull();
  });

  it('skips a responder that advertised neither a usable address nor a host name', () => {
    expect(toDiscoveredHub(responder({ addresses: [], host: '' }), [OWN_WIFI])).toBeNull();
  });
});
