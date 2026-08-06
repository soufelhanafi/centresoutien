import {
  SchemaTooOldError,
  type CenterCode,
  type ChangeBatch,
  type DeviceId,
  type HubChange,
  type LocalChange,
  type PushResult,
  type SyncCursor,
  type SyncHubPort,
} from '@centresoutien/domain';
import { HubTransportError } from './hub-transport-error';

/**
 * HTTP adapter for {@link SyncHubPort} (SOU-90) — the spoke side of the
 * embedded LAN hub. One instance is bound to one hub address + pairing token;
 * the `centreId` the engine syncs flows into the request path, so the hub's
 * tenant scoping is enforced on every call. The hub laptop uses THIS SAME
 * adapter against `127.0.0.1` — it is never special-cased in the sync code.
 *
 * Wire contract (mirrors the domain types 1:1, JSON):
 *  - POST /hub/v1/:centreId/pull   { cursor, deviceId } → ChangeBatch
 *  - POST /hub/v1/:centreId/push   { deviceId, schemaVersion, changes } → PushResult
 *  - GET  /hub/v1/:centreId/cursor?deviceId=… → { cursor }
 * The `x-hub-token` header carries the pairing token on every call.
 *
 * `receivedAt` / `hubTime` are revived to `Date`; entity payload dates stay
 * ISO strings (identical to change_log payload serialization), so a pulled
 * snapshot matches what the device itself would have written.
 */
export class HttpSyncHubClient implements SyncHubPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async pullChanges(
    centreId: CenterCode,
    cursor: SyncCursor | null,
    deviceId: DeviceId,
  ): Promise<ChangeBatch> {
    const response = await this.request(
      `/${centreId}/pull`,
      {
        method: 'POST',
        body: JSON.stringify({ cursor: cursor ?? null, deviceId }),
      },
    );
    this.expectOk(response);
    return reviveBatch((await response.json()) as WireBatch);
  }

  async pushChanges(input: {
    centreId: CenterCode;
    deviceId: DeviceId;
    changes: readonly LocalChange[];
    schemaVersion: number;
  }): Promise<PushResult> {
    const response = await this.request(`/${input.centreId}/push`, {
      method: 'POST',
      body: JSON.stringify({
        deviceId: input.deviceId,
        schemaVersion: input.schemaVersion,
        changes: input.changes,
      }),
    });
    if (response.status === 409) {
      const body = (await response.json()) as { deviceSchema?: number; requiredSchema?: number };
      throw new SchemaTooOldError(body.deviceSchema ?? 0, body.requiredSchema ?? 0);
    }
    this.expectOk(response);
    return (await response.json()) as PushResult;
  }

  async getCursor(deviceId: DeviceId, centreId: CenterCode): Promise<SyncCursor | null> {
    const response = await this.request(
      `/${centreId}/cursor?deviceId=${encodeURIComponent(deviceId)}`,
      { method: 'GET' },
    );
    this.expectOk(response);
    const body = (await response.json()) as { cursor: { seq: number } | null };
    return body.cursor;
  }

  /** Network failure + auth rejection are transport errors; everything else returns for the caller to decode (409 = schema handshake). */
  private async request(path: string, init: { method: string; body?: string }): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/hub/v1${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-hub-token': this.token,
        },
      });
    } catch (cause) {
      throw new HubTransportError('unreachable', `Cannot reach the sync hub at ${this.baseUrl}.`, {
        cause,
      });
    }
    if (response.status === 401) {
      throw new HubTransportError(
        'unauthorized',
        'The sync hub rejected this device: bad pairing token for the center.',
      );
    }
    return response;
  }

  private expectOk(response: Response): void {
    if (!response.ok) {
      throw new HubTransportError('bad-response', `The sync hub answered HTTP ${response.status}.`);
    }
  }
}

type WireBatch = {
  changes: readonly WireChange[];
  cursor: { seq: number };
  schemaVersion: number;
  hubTime: string;
};

type WireChange = Omit<HubChange, 'receivedAt'> & { receivedAt: string };

/** Revive the protocol-level timestamps only; entity payload dates stay strings. */
function reviveBatch(batch: WireBatch): ChangeBatch {
  return {
    changes: batch.changes.map((change) => ({ ...change, receivedAt: new Date(change.receivedAt) })),
    cursor: batch.cursor,
    schemaVersion: batch.schemaVersion,
    hubTime: new Date(batch.hubTime),
  };
}
