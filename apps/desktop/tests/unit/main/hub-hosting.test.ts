import { describe, expect, it } from 'vitest';
import type { HubHostConfig } from '../../../src/main/infra/hub-host-config-store';
import {
  HubHostingService,
  HubNoLanInterfaceError,
  type HubHostingConfigAccess,
} from '../../../src/main/hub-discovery/hub-hosting';

class FakeConfig implements HubHostingConfigAccess {
  private stored: HubHostConfig | null = null;
  read(): HubHostConfig | null {
    return this.stored;
  }
  write(config: HubHostConfig): void {
    this.stored = config;
  }
  clear(): void {
    this.stored = null;
  }
}

const zeroBytes = (size: number): Uint8Array => new Uint8Array(size);

describe('HubHostingService', () => {
  it('reports not-hosting when no config is stored', () => {
    const service = new HubHostingService({ config: new FakeConfig(), resolveBindHost: () => '192.168.1.5', randomBytes: zeroBytes });
    expect(service.status()).toEqual({ hosting: false });
  });

  it('enable writes config, resolves the LAN address, and mints a token', () => {
    const config = new FakeConfig();
    const service = new HubHostingService({ config, resolveBindHost: () => '192.168.1.5', randomBytes: zeroBytes });

    const status = service.enable();

    expect(status).toEqual({ hosting: true, address: '192.168.1.5', port: 4747, token: '0000-0000-0000' });
    expect(config.read()).toEqual({ port: 4747, bindHost: '192.168.1.5', token: '0000-0000-0000' });
  });

  it('honors a custom default port', () => {
    const service = new HubHostingService({ config: new FakeConfig(), resolveBindHost: () => '10.0.0.9', randomBytes: zeroBytes, defaultPort: 5252 });
    expect(service.enable().hosting && service.status()).toMatchObject({ port: 5252 });
  });

  it('enable is idempotent and TOKEN-STABLE — a re-enable keeps the paired token', () => {
    const config = new FakeConfig();
    let seed = 1;
    const service = new HubHostingService({
      config,
      resolveBindHost: () => '192.168.1.5',
      // Different bytes each call — proves the token is NOT regenerated on re-enable.
      randomBytes: (size) => Uint8Array.from({ length: size }, () => seed++),
    });

    const first = service.enable();
    const second = service.enable();

    expect(second).toEqual(first);
  });

  it('throws when the machine has no LAN interface to host on', () => {
    const service = new HubHostingService({ config: new FakeConfig(), resolveBindHost: () => null, randomBytes: zeroBytes });
    expect(() => service.enable()).toThrow(HubNoLanInterfaceError);
  });

  it('disable clears the config back to not-hosting', () => {
    const config = new FakeConfig();
    const service = new HubHostingService({ config, resolveBindHost: () => '192.168.1.5', randomBytes: zeroBytes });
    service.enable();

    service.disable();

    expect(config.read()).toBeNull();
    expect(service.status()).toEqual({ hosting: false });
  });
});
