import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { CenterCode, DeviceId } from '@centresoutien/domain';
import { HttpSyncHubClient } from '../../../../src/data/sync/http-sync-hub-client';
import { HubTransportError } from '../../../../src/data/sync/hub-transport-error';

const CENTRE = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_0000000000000000000000000A' as DeviceId;
const REQUEST_TIMEOUT_MS = 30_000;

/** A `fetch` whose response reports 200 but whose body never resolves until the
 *  request's own abort signal fires — the "hub sent headers then stalled" case. */
function headersThenStalledBodyFetch(): typeof fetch {
  return ((_url: string, init?: { signal?: AbortSignal }) =>
    Promise.resolve({
      status: 200,
      ok: true,
      text: () =>
        new Promise<string>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    } as unknown as Response)) as unknown as typeof fetch;
}

/** A `fetch` that never resolves until aborted — the connection never answers. */
function neverAnsweringFetch(): typeof fetch {
  return ((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    })) as unknown as typeof fetch;
}

function jsonFetch(status: number, body: unknown): typeof fetch {
  return (() =>
    Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response)) as unknown as typeof fetch;
}

describe('HttpSyncHubClient request timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('times out instead of hanging when the hub sends headers then stalls mid-body', async () => {
    const client = new HttpSyncHubClient({
      baseUrl: 'http://192.168.1.20:7071',
      token: 'pair-token',
      fetchImpl: headersThenStalledBodyFetch(),
    });

    const pull = client.pullChanges(CENTRE, null, DEVICE);
    const assertion = expect(pull).rejects.toMatchObject({
      code: 'unreachable',
      message: expect.stringContaining('did not answer in time'),
    });

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('times out when the connection never answers at all', async () => {
    const client = new HttpSyncHubClient({
      baseUrl: 'http://192.168.1.20:7071',
      token: 'pair-token',
      fetchImpl: neverAnsweringFetch(),
    });

    const cursor = client.getCursor(DEVICE, CENTRE);
    const assertion = expect(cursor).rejects.toBeInstanceOf(HubTransportError);

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('returns the parsed cursor when the body arrives in time', async () => {
    const client = new HttpSyncHubClient({
      baseUrl: 'http://192.168.1.20:7071',
      token: 'pair-token',
      fetchImpl: jsonFetch(200, { cursor: { seq: 42 } }),
    });

    await expect(client.getCursor(DEVICE, CENTRE)).resolves.toEqual({ seq: 42 });
  });

  // The join probes each candidate address in turn, so a short budget is what
  // keeps a host that DROPS packets (a firewall, rather than a refused
  // connection) from costing 30s per address on the joining laptop's screen.
  it('honours a shorter per-request timeout when one is configured', async () => {
    const client = new HttpSyncHubClient({
      baseUrl: 'http://192.168.1.20:7071',
      token: 'pair-token',
      fetchImpl: neverAnsweringFetch(),
      timeoutMs: 3_000,
    });

    const cursor = client.getCursor(DEVICE, CENTRE);
    const assertion = expect(cursor).rejects.toMatchObject({ code: 'unreachable' });

    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;
  });
});
