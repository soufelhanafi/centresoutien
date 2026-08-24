import { describe, expect, it, vi } from 'vitest';
import type { FeatureFlag } from '@centresoutien/domain';
import { createHubHandlers } from '../../../src/main/ipc/hub-handlers';
import { HubHostingService } from '../../../src/main/hub-discovery/hub-hosting';
import type { HubHostConfig } from '../../../src/main/infra/hub-host-config-store';
import type { DiscoveredHub, HubDiscovererPort } from '../../../src/main/hub-discovery/hub-service';

function fakePlan(locked = false) {
  const required: FeatureFlag[] = [];
  return {
    required,
    gate: {
      require: (feature: FeatureFlag) => {
        required.push(feature);
        if (locked) throw new Error(`feature ${feature} unavailable`);
      },
    },
  };
}

function hostingService() {
  let stored: HubHostConfig | null = null;
  return new HubHostingService({
    config: {
      read: () => stored,
      write: (config) => {
        stored = config;
      },
      clear: () => {
        stored = null;
      },
    },
    resolveBindHost: () => '192.168.1.5',
    randomBytes: (size) => new Uint8Array(size),
  });
}

const DISCOVERED: DiscoveredHub = {
  name: 'Centre Al Ilm',
  host: '192.168.1.5',
  port: 4747,
  centreId: 'local',
  centerCode: 'CS-CASA-001',
};

const discoverer = (centers: readonly DiscoveredHub[]): HubDiscovererPort => ({
  discover: () => Promise.resolve(centers),
});

/** A join stub that fails the test if a handler unexpectedly triggers a join. */
const noJoin = {
  execute: () => {
    throw new Error('joinCenter.execute should not have been called');
  },
};

describe('createHubHandlers', () => {
  it('hub.hostingStatus gates on sync.multi-device and reports status', async () => {
    const plan = fakePlan();
    const handlers = createHubHandlers({
      plan: plan.gate,
      hubHosting: hostingService(),
      hubDiscoverer: null,
      requestHubRestart: () => {},
      joinCenter: noJoin,
    });

    expect(await handlers['hub.hostingStatus']({})).toEqual({ hosting: false });
    expect(plan.required).toContain('sync.multi-device');
  });

  it('hub.enableHosting persists config, returns the token, and requests a restart', async () => {
    const restart = vi.fn();
    const handlers = createHubHandlers({
      plan: fakePlan().gate,
      hubHosting: hostingService(),
      hubDiscoverer: null,
      requestHubRestart: restart,
      joinCenter: noJoin,
    });

    const status = await handlers['hub.enableHosting']({});

    expect(status).toEqual({ hosting: true, address: '192.168.1.5', port: 4747, token: '0000-0000-0000' });
    expect(restart).toHaveBeenCalledOnce();
  });

  it('hub.disableHosting clears hosting and requests a restart', async () => {
    const restart = vi.fn();
    const service = hostingService();
    service.enable();
    const handlers = createHubHandlers({
      plan: fakePlan().gate,
      hubHosting: service,
      hubDiscoverer: null,
      requestHubRestart: restart,
      joinCenter: noJoin,
    });

    expect(await handlers['hub.disableHosting']({})).toEqual({ ok: true });
    expect(service.status()).toEqual({ hosting: false });
    expect(restart).toHaveBeenCalledOnce();
  });

  it('hub.discoverCenters returns the LAN responders the discoverer found', async () => {
    const handlers = createHubHandlers({
      plan: fakePlan().gate,
      hubHosting: null,
      hubDiscoverer: discoverer([DISCOVERED]),
      requestHubRestart: () => {},
      joinCenter: noJoin,
    });

    expect(await handlers['hub.discoverCenters']({})).toEqual({ centers: [DISCOVERED] });
  });

  it('hub.discoverCenters returns empty when no mDNS discoverer is wired', async () => {
    const handlers = createHubHandlers({
      plan: fakePlan().gate,
      hubHosting: null,
      hubDiscoverer: null,
      requestHubRestart: () => {},
      joinCenter: noJoin,
    });
    expect(await handlers['hub.discoverCenters']({})).toEqual({ centers: [] });
  });

  it('a locked plan blocks the channel before any hosting work', async () => {
    const restart = vi.fn();
    const handlers = createHubHandlers({
      plan: fakePlan(true).gate,
      hubHosting: hostingService(),
      hubDiscoverer: null,
      requestHubRestart: restart,
      joinCenter: noJoin,
    });

    expect(() => handlers['hub.enableHosting']({})).toThrow('unavailable');
    expect(restart).not.toHaveBeenCalled();
  });

  it('hub.joinCenter forwards the discovered target + token to the use case', async () => {
    const calls: unknown[] = [];
    const handlers = createHubHandlers({
      plan: fakePlan().gate,
      hubHosting: null,
      hubDiscoverer: null,
      requestHubRestart: () => {},
      joinCenter: {
        execute: (input) => {
          calls.push(input);
          return Promise.resolve({ ok: true as const, centreId: 'ctr_joined', centerCode: input.centerCode });
        },
      },
    });

    const result = await handlers['hub.joinCenter']({
      baseUrl: 'http://192.168.1.5:4747',
      token: 'PAIR-CODE',
      centerCode: 'CS-CASA-001',
    });

    expect(result).toEqual({ ok: true, centreId: 'ctr_joined', centerCode: 'CS-CASA-001' });
    expect(calls).toEqual([{ baseUrl: 'http://192.168.1.5:4747', token: 'PAIR-CODE', centerCode: 'CS-CASA-001' }]);
  });
});
