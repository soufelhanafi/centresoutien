import { z } from 'zod';
import {
  SchemaTooOldError,
  type CenterCode,
  type ChangeBatch,
  type DeviceId,
  type EntityId,
  type HubChange,
  type LocalChange,
  type PushResult,
  type SyncCursor,
  type SyncHubPort,
  type UserId,
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
 * Success responses are Zod-validated before they become domain values (SOU-90
 * review Major 1): a hub answering 200 with a malformed body is a
 * `bad-response` transport error, never a malformed batch handed to the engine.
 *
 * `receivedAt` / `hubTime` are revived to `Date`; entity payload dates stay
 * ISO strings (identical to change_log payload serialization), so a pulled
 * snapshot matches what the device itself would have written.
 */
const REQUEST_TIMEOUT_MS = 30_000;

const wireChangeSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  version: z.number(),
  seq: z.number(),
  op: z.enum(['create', 'update', 'delete']),
  entity: z.record(z.string(), z.unknown()),
  changedFields: z.array(z.string()),
  deviceId: z.string(),
  updatedBy: z.string(),
  deviceSeq: z.number(),
  receivedAt: z.string(),
});

const batchSchema = z.object({
  changes: z.array(wireChangeSchema),
  cursor: z.object({ seq: z.number() }),
  schemaVersion: z.number(),
  hubTime: z.string(),
  remaining: z.number(),
});

const pushResultSchema = z.union([
  z.object({
    status: z.literal('accepted'),
    versions: z.record(z.string(), z.number()),
    cursor: z.object({ seq: z.number() }),
  }),
  z.object({
    status: z.literal('rejected-stale'),
    cursor: z.object({ seq: z.number() }),
  }),
]);

const cursorResponseSchema = z.object({
  cursor: z.object({ seq: z.number() }).nullable(),
});

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
    limit?: number,
  ): Promise<ChangeBatch> {
    const response = await this.request(
      `/${centreId}/pull`,
      {
        method: 'POST',
        body: JSON.stringify({ cursor: cursor ?? null, deviceId, limit }),
      },
    );
    this.expectOk(response);
    const batch = batchSchema.safeParse(this.parseJson(response));
    if (!batch.success) {
      throw new HubTransportError('bad-response', 'The sync hub sent a malformed change batch.');
    }
    return reviveBatch(batch.data);
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
      const body = this.parseJson(response) as { deviceSchema?: number; requiredSchema?: number };
      throw new SchemaTooOldError(body.deviceSchema ?? 0, body.requiredSchema ?? 0);
    }
    this.expectOk(response);
    const result = pushResultSchema.safeParse(this.parseJson(response));
    if (!result.success) {
      throw new HubTransportError('bad-response', 'The sync hub sent a malformed push result.');
    }
    return result.data;
  }

  async getCursor(deviceId: DeviceId, centreId: CenterCode): Promise<SyncCursor | null> {
    const response = await this.request(
      `/${centreId}/cursor?deviceId=${encodeURIComponent(deviceId)}`,
      { method: 'GET' },
    );
    this.expectOk(response);
    const parsed = cursorResponseSchema.safeParse(this.parseJson(response));
    if (!parsed.success) {
      throw new HubTransportError('bad-response', 'The sync hub sent a malformed cursor response.');
    }
    return parsed.data.cursor;
  }

  /**
   * Network failure + timeout + auth rejection are transport errors; everything
   * else is returned for the caller to decode (409 = schema handshake).
   *
   * The timeout must cover the whole exchange, body included: `fetch` resolves
   * the moment response headers arrive, so a hub that sends headers and then
   * stalls mid-body (the other laptop went to sleep, WiFi dropped between the two)
   * would leave the body read hanging forever if the timer were cleared at
   * headers — the sync spinner spins with no progress until the app is killed.
   * The body is therefore drained here under the same abort signal, and the timer
   * is cleared only once the bytes are in hand.
   */
  private async request(path: string, init: { method: string; body?: string }): Promise<HubResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/hub/v1${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-hub-token': this.token,
        },
        signal: controller.signal,
      });
      if (response.status === 401) {
        throw new HubTransportError(
          'unauthorized',
          'The sync hub rejected this device: bad pairing token for the center.',
        );
      }
      const rawBody = await response.text();
      return { status: response.status, ok: response.ok, rawBody };
    } catch (cause) {
      if (cause instanceof HubTransportError) throw cause;
      const message = controller.signal.aborted
        ? `The sync hub at ${this.baseUrl} did not answer in time.`
        : `Cannot reach the sync hub at ${this.baseUrl}.`;
      throw new HubTransportError('unreachable', message, { cause });
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJson(response: HubResponse): unknown {
    try {
      return JSON.parse(response.rawBody) as unknown;
    } catch {
      throw new HubTransportError('bad-response', `The sync hub sent a non-JSON body (HTTP ${response.status}).`);
    }
  }

  private expectOk(response: HubResponse): void {
    if (!response.ok) {
      throw new HubTransportError('bad-response', `The sync hub answered HTTP ${response.status}.`);
    }
  }
}

/** A hub HTTP exchange whose body was fully drained inside the request timeout. */
type HubResponse = { status: number; ok: boolean; rawBody: string };

/** Revive the protocol-level timestamps only; entity payload dates stay strings. */
function reviveBatch(batch: z.infer<typeof batchSchema>): ChangeBatch {
  const changes: readonly HubChange[] = batch.changes.map((change) => ({
    entityType: change.entityType,
    entityId: change.entityId as EntityId,
    version: change.version,
    seq: change.seq,
    op: change.op,
    entity: change.entity,
    changedFields: change.changedFields,
    deviceId: change.deviceId as DeviceId,
    updatedBy: change.updatedBy as UserId,
    deviceSeq: change.deviceSeq,
    receivedAt: new Date(change.receivedAt),
  }));
  return {
    changes,
    cursor: batch.cursor,
    schemaVersion: batch.schemaVersion,
    hubTime: new Date(batch.hubTime),
    remaining: batch.remaining,
  };
}
