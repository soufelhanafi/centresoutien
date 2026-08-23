import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for the landing password-reset relay (SOU-273) for the email-reset
 * E2E. The real relay is an external internet service; the desktop points at this
 * local mock via the `CS_RELAY_URL` env (read only in the `__CS_E2E__` build), so
 * the flow is asserted end-to-end — request → emailed code → confirm → local
 * reset — with no external dependency.
 *
 * Contract mirrored from the real endpoints:
 *  - POST /api/auth/reset-request  → 200 { ok: true } (never enumerates)
 *  - POST /api/auth/reset-confirm  → 200 { ok: true } for the expected code,
 *                                     400 { ok: false } otherwise
 * The expected code is fixed so the spec can type it, standing in for the code the
 * real relay would email. Every request body is recorded so a spec can assert the
 * desktop sent the owner's identity + the chosen locale.
 */
export const MOCK_RESET_CODE = '424242';

export type RecordedRequest = { path: string; body: Record<string, unknown> };

export type MockRelay = {
  readonly url: string;
  readonly requests: readonly RecordedRequest[];
  close: () => Promise<void>;
};

export async function startMockRelay(): Promise<MockRelay> {
  const requests: RecordedRequest[] = [];

  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        body = {};
      }
      const path = req.url ?? '';
      requests.push({ path, body });

      res.setHeader('content-type', 'application/json');
      if (path.endsWith('/api/auth/reset-request')) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (path.endsWith('/api/auth/reset-confirm')) {
        const ok = body['code'] === MOCK_RESET_CODE;
        res.statusCode = ok ? 200 : 400;
        res.end(JSON.stringify(ok ? { ok: true } : { ok: false, error: 'invalid_or_expired' }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
