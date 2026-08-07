import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { CenterCode, DeviceId, EntityId, LocalChange, UserId } from '@centresoutien/domain';

/**
 * HTTP plumbing for the embedded hub server (SOU-90): route parsing, request
 * bodies, wire validation, and the wire ↔ {@link LocalChange} mapping. Kept out
 * of `hub-server.ts` so the request handlers stay readable and the file stays
 * under the size ceiling.
 */
export type HubRouteAction = 'pull' | 'push' | 'cursor';

export type HubRoute = { centreId: CenterCode; action: HubRouteAction };

/**
 * Hard cap on a hub request body. A center's batch is small (per-entity JSON);
 * the cap just stops a token-holding LAN client from exhausting hub memory
 * with an unbounded upload.
 */
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Boundary validation (SOU-90 review Major 1). The renderer-input-via-IPC rule
 * applies here too: a token-holding but buggy/hostile LAN device is untrusted,
 * so every field that lands in a store query is Zod-validated BEFORE use. A
 * malformed payload is a deterministic 400, never a write into the canonical
 * store or a 500.
 */
const wireChangeSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  deviceId: z.string().min(1),
  baseVersion: z.number().int().nonnegative(),
  op: z.enum(['create', 'update', 'delete']),
  entity: z.record(z.string(), z.unknown()),
  changedFields: z.array(z.string()),
  seq: z.number().int(),
  at: z.string().min(1),
  updatedBy: z.string().min(1),
});

/** Wire shape of {@link LocalChange} — dates arrive as ISO strings, not Date. */
export type WireLocalChange = z.infer<typeof wireChangeSchema>;

export const pullBodySchema = z.object({
  deviceId: z.string().min(1),
  cursor: z.object({ seq: z.number().int().nonnegative() }).nullish(),
});

export const pushBodySchema = z.object({
  deviceId: z.string().min(1),
  schemaVersion: z.number().int().nonnegative(),
  changes: z.array(wireChangeSchema),
});

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
    entityId: change.entityId as EntityId,
    deviceId: change.deviceId as DeviceId,
    baseVersion: change.baseVersion,
    op: change.op,
    entity: change.entity,
    changedFields: change.changedFields,
    seq: change.seq,
    at: new Date(change.at),
    updatedBy: change.updatedBy as UserId,
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
        // Reject but do NOT destroy/pause the socket — the handler must be able
        // to answer 413 promptly. Memory stays bounded (we stop appending past
        // the cap) and Node closes the connection after the response because
        // the request body was never fully consumed.
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
