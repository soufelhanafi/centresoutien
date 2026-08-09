import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import {
  SchemaTooOldError,
  type CenterCode,
  type DeviceId,
  type LocalChange,
} from '@centresoutien/domain';
import type { HubStorePort } from '../../data/sqlite/hub/hub-store';
import {
  expectMethod,
  HubBadRequest,
  HubBodyTooLargeError,
  parseRoute,
  pullBodySchema,
  pushBodySchema,
  readJsonBody,
  toLocalChange,
} from './hub-http';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}

/**
 * The embedded LAN hub (SOU-90): a small Node HTTP listener inside the Electron
 * main process of a designated laptop, exposing the {@link SyncHubPort}
 * protocol as JSON routes over the center's WiFi:
 *
 *  - POST /hub/v1/:centreId/pull  { cursor, deviceId }         → ChangeBatch
 *  - POST /hub/v1/:centreId/push  { deviceId, schemaVersion, changes } → PushResult
 *  - GET  /hub/v1/:centreId/cursor?deviceId=…                   → { cursor }
 *
 * It is a dumb versioned mailbox, exactly like the store it fronts: it
 * authenticates (per-center pairing token), routes, validates the wire shape,
 * and serializes. All the accept/reject semantics live in `SqliteHubStore`; any
 * merge or resolution logic that ever shows up here is an architecture
 * violation.
 *
 * Security: per-center pairing token checked on every request, LAN-only bind
 * (the host interface is explicit — loopback in tests, the center's LAN
 * interface in production), never exposed beyond the local network. The hub
 * laptop reaches its own hub over `127.0.0.1` through the SAME `SyncHubPort`
 * client as every other device — this server has no special lane for its own
 * machine.
 */
export class HubServer {
  private readonly server: HttpServer;

  constructor(
    private readonly store: HubStorePort,
    private readonly listenPort: number,
    private readonly bindHost: string = '0.0.0.0',
  ) {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    // No client should hold a hub connection open: cap request + socket idle
    // time so a stalled LAN peer can never pin the listener.
    this.server.requestTimeout = 30_000;
    this.server.headersTimeout = 10_000;
    this.server.on('connection', (socket) => {
      socket.setTimeout(30_000);
      socket.on('timeout', () => socket.destroy());
    });
  }

  /** Bind and start listening; resolves with the actually-bound port (0 = ephemeral). */
  async start(options: { readonly retries?: number; readonly retryDelayMs?: number } = {}): Promise<number> {
    const retries = options.retries ?? 0;
    const retryDelayMs = options.retryDelayMs ?? 100;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.listenOnce();
      } catch (error) {
        if (!isAddressInUse(error) || attempt >= retries) throw error;
        await delay(retryDelayMs);
      }
    }
  }

  private listenOnce(): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        this.server.off('error', onError);
        const bound = this.server.address();
        console.info(
          '[hub] listening on',
          typeof bound === 'object' && bound !== null ? `${bound.address}:${bound.port}` : 'unknown',
        );
        resolve(this.port());
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this.listenPort, this.bindHost);
    });
  }

  stop(): Promise<void> {
    if (!this.server.listening) return Promise.resolve();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /** The currently-bound port — the port the hub host's own client must use. */
  port(): number {
    const address = this.server.address();
    return typeof address === 'object' && address !== null ? address.port : 0;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const route = parseRoute(req);
      if (!route) {
        this.send(res, 404, { error: 'not-found' });
        return;
      }
      if (!this.isAuthorized(req, route.centreId)) {
        this.send(res, 401, { error: 'unauthorized' });
        return;
      }
      switch (route.action) {
        case 'pull':
          await this.handlePull(req, res, route.centreId);
          return;
        case 'push':
          await this.handlePush(req, res, route.centreId);
          return;
        case 'cursor':
          this.handleCursor(req, res, route.centreId);
          return;
      }
    } catch (error) {
      if (error instanceof SchemaTooOldError) {
        this.send(res, 409, {
          error: 'schema-too-old',
          deviceSchema: error.deviceSchema,
          requiredSchema: error.requiredSchema,
        });
        return;
      }
      if (error instanceof HubBadRequest) {
        this.send(res, 400, { error: 'bad-request' });
        return;
      }
      if (error instanceof HubBodyTooLargeError) {
        this.send(res, 413, { error: 'request-too-large' });
        return;
      }
      // Server-side fault: log the cause so the operator can act — message +
      // stack only, never the request body (entity payloads carry Loi 09-08 data).
      console.error('[hub] request failed:', error);
      this.send(res, 500, { error: 'internal' });
    }
  }

  private isAuthorized(req: IncomingMessage, centreId: CenterCode): boolean {
    const header = req.headers['x-hub-token'];
    if (typeof header !== 'string' || header.length === 0) return false;
    const stored = this.store.tokenFor(centreId);
    if (stored === null) return false;
    // Compare digests (constant size) so token length can't leak over timing.
    const a = createHash('sha256').update(header).digest();
    const b = createHash('sha256').update(stored).digest();
    return timingSafeEqual(a, b);
  }

  private async handlePull(req: IncomingMessage, res: ServerResponse, centreId: CenterCode): Promise<void> {
    if (!expectMethod(req, res, 'POST')) return;
    const parsed = pullBodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      this.send(res, 400, { error: 'bad-request' });
      return;
    }
    const cursor = parsed.data.cursor ?? null;
    this.send(res, 200, this.store.pull(centreId, cursor, parsed.data.deviceId as DeviceId));
  }

  private async handlePush(req: IncomingMessage, res: ServerResponse, centreId: CenterCode): Promise<void> {
    if (!expectMethod(req, res, 'POST')) return;
    const parsed = pushBodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      this.send(res, 400, { error: 'bad-request' });
      return;
    }
    const changes: readonly LocalChange[] = parsed.data.changes.map(toLocalChange);
    this.send(
      res,
      200,
      this.store.push({
        centreId,
        deviceId: parsed.data.deviceId as DeviceId,
        changes,
        schemaVersion: parsed.data.schemaVersion,
      }),
    );
  }

  private handleCursor(req: IncomingMessage, res: ServerResponse, centreId: CenterCode): void {
    if (!expectMethod(req, res, 'GET')) return;
    const url = new URL(req.url ?? '', 'http://localhost');
    const deviceId = url.searchParams.get('deviceId');
    if (deviceId === null || deviceId.length === 0) {
      this.send(res, 400, { error: 'bad-request' });
      return;
    }
    const cursor = this.store.cursorFor(deviceId as DeviceId, centreId);
    this.send(res, 200, { cursor });
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}
