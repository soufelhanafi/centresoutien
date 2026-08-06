import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CenterCode, LocalChange } from '@centresoutien/domain';

/**
 * HTTP plumbing for the embedded hub server (SOU-90): route parsing, request
 * bodies, and the wire ↔ {@link LocalChange} mapping. Kept out of `hub-server.ts`
 * so the request handlers stay readable and the file stays under the size
 * ceiling.
 */
export type HubRouteAction = 'pull' | 'push' | 'cursor';

export type HubRoute = { centreId: CenterCode; action: HubRouteAction };

/** Wire shape of {@link LocalChange} — dates arrive as ISO strings, not Date. */
export type WireLocalChange = Omit<LocalChange, 'at'> & { at: string };

/**
 * Hard cap on a hub request body. A center's batch is small (per-entity JSON);
 * the cap just stops a token-holding LAN client from exhausting hub memory
 * with an unbounded upload.
 */
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

export function parseRoute(req: IncomingMessage): HubRoute | null {
  if (req.url === undefined) return null;
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter((part) => part.length > 0);
  if (parts.length !== 4 || parts[0] !== 'hub' || parts[1] !== 'v1') return null;
  const action = parts[3];
  if (action !== 'pull' && action !== 'push' && action !== 'cursor') return null;
  return { centreId: parts[2] as CenterCode, action };
}

export function toLocalChange(change: WireLocalChange): LocalChange {
  return {
    entityType: change.entityType,
    entityId: change.entityId,
    deviceId: change.deviceId,
    baseVersion: change.baseVersion,
    op: change.op,
    entity: change.entity,
    changedFields: change.changedFields,
    seq: change.seq,
    at: new Date(change.at),
    updatedBy: change.updatedBy,
  };
}

export function expectMethod(req: IncomingMessage, res: ServerResponse, method: 'GET' | 'POST'): boolean {
  if (req.method === method) return true;
  res.writeHead(405, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'method-not-allowed' }));
  return false;
}

export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BODY_BYTES) {
        // Stop reading but do NOT destroy the socket — the handler must be able
        // to answer 413. Any further data is ignored; the promise is settled.
        if (!rejected) {
          rejected = true;
          reject(new HubBodyTooLargeError());
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch {
        reject(new HubBadRequest());
      }
    });
    req.on('error', (error) => reject(error));
  });
}

/** Signals a malformed request body — the handler maps it to HTTP 400. */
export class HubBadRequest extends Error {}

/** Signals a request body over {@link MAX_REQUEST_BODY_BYTES} — mapped to HTTP 413. */
export class HubBodyTooLargeError extends Error {}
