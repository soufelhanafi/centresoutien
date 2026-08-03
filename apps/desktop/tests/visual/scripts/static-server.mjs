import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const RENDERER_DIR = normalize(join(here, '../../../out/renderer'));
const PORT = Number(process.env['VISUAL_STATIC_PORT'] ?? 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Serves the already-built renderer bundle (`out/renderer`, produced by
 * `pnpm build`) over plain HTTP (SOU-146) so the visual suite can load the
 * real app UI in an ordinary Chromium page instead of inside Electron, and
 * fully control `window.api` from the test side (see `mock-bridge.ts`).
 *
 * A real HTTP origin is required, not `file://`: Chromium refuses cross-origin
 * fetches for `type="module"` scripts loaded from `file://`, and the renderer
 * bundle is an ES module. Hash routing (`app/router.tsx`'s `createHashHistory`)
 * means every screen resolves to the same `index.html`, so there is no
 * server-side routing to implement here — just static files.
 */
const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
      const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const filePath = normalize(join(RENDERER_DIR, requested));

      if (!filePath.startsWith(RENDERER_DIR + sep) && filePath !== RENDERER_DIR) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })();
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[visual] serving out/renderer on http://127.0.0.1:${PORT}\n`);
});
