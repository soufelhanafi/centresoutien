/**
 * SOU-247 — Planning page single-scroll-region verification harness.
 *
 * WHY THIS EXISTS (not a Playwright `_electron` spec):
 * The packaged Electron app cannot boot in this CI sandbox — `better-sqlite3-
 * multiple-ciphers` needs an Electron-ABI native rebuild whose Node headers come
 * from www.electronjs.org, which the egress proxy blocks (403). So the canonical
 * `apps/desktop/tests/e2e/planning-scroll-region.spec.ts` (which drives the real
 * Electron main process) can't run here.
 *
 * This harness verifies the SAME contract against the REAL renderer bundle
 * (`apps/desktop/out/renderer`, freshly built at HEAD) using standalone Chromium
 * (the same Blink engine Electron embeds), served over http, with a stubbed
 * `window.api` injected via addInitScript so the shell + PlannerPage mount and a
 * wide 08:00–22:00 center-hours week makes the grid overflow. It is Chromium, not
 * the packaged app — the layout/scroll CSS under test is renderer-only, so the
 * measurement is faithful for these ACs.
 *
 * Run: node tests/e2e/planning-scroll-region.chromium-harness.mjs
 */
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(join(HERE, '../../apps/desktop/node_modules/@playwright/test'));

const ROOT = process.env.CS_RENDERER_OUT || join(HERE, '../../apps/desktop/out/renderer');
// Standalone Chromium (same Blink engine Electron embeds). Override via CS_CHROMIUM.
const CHROME = process.env.CS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = join(HERE, '../../test-results/sou-247');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };

const NAV = { fr: 'Planning', ar: 'الجدولة' };
const TITLE = { fr: 'Planning hebdomadaire', ar: 'الجدول الأسبوعي' };
const SIZES = [
  { w: 1280, h: 800, label: '1280x800 (min supported)' },
  { w: 1280, h: 560, label: '1280x560 (below min)' },
];
const LOCALES = ['fr', 'ar'];

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = join(ROOT, p);
      const buf = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      try { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await readFile(join(ROOT, 'index.html'))); }
      catch { res.writeHead(404); res.end('nf'); }
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function initScript(locale) {
  return (loc) => {
    const PREMIUM = ['core.rooms','core.teachers','core.students','core.groups','core.subjects','core.formulas','core.calendar.week','core.invoicing','core.parents','settings.center-hours','dashboard.basic','core.invoicing.partial-paid','core.invoice-template.customize','core.exam-prep','payroll.teacher','payroll.teacher.fixed','payroll.teacher.percentage','settings.holidays','io.excel.export','io.excel.import','io.excel.sync','planning.custom-grid','dashboard.advanced','planning.random-auto','sync.multi-device','sync.cloud','sync.conflict-resolution','org.multi-center','limits.students.unlimited','limits.teachers.unlimited'];
    const user = { id: 'u1', username: 'directrice', displayName: 'Directrice', role: 'admin' };
    const center = { id: 'c1', centerCode: 'CS-CASA-001', name: { fr: 'Centre Test', ar: 'مركز' } };
    // Wide week so the 14h grid overflows any supported viewport.
    const week = [0,1,2,3,4,5,6].map((d) => ({ dayOfWeek: d, windows: [{ open: '08:00', close: '22:00' }] }));
    const map = {
      'admin.exists': { exists: true },
      'plan.get': { id: 'premium', features: PREMIUM, limits: { maxStudents: 'unlimited', maxTeachers: 'unlimited', maxRooms: 'unlimited' } },
      'license.status': { status: 'active', plan: 'premium', valid: true, activated: true },
      'auth.session': { authenticated: true, user },
      'auth.login': { outcome: 'success' },
      'demo.status': { active: false },
      'centerHours.get': { week },
      'centerHours.save': { ok: true },
      'centerHoursOverride.list': [],
      'center.list': [center], 'center.current': center, 'center.get': center,
      'session.week': { sessions: [] },
      'group.listWithCounts': [],
    };
    const respond = (channel) => {
      if (channel in map) return map[channel];
      if (channel.startsWith('session.audit')) return [];
      if (channel === 'session.week') return { sessions: [] };
      if (channel.endsWith('.exists')) return { exists: true };
      if (channel.endsWith('.list') || channel.endsWith('.all') || channel.endsWith('WithCounts')) return [];
      if (channel.startsWith('license.')) return { status: 'active', valid: true };
      if (channel.startsWith('plan.')) return map['plan.get'];
      if (channel.startsWith('auth.') || channel.startsWith('session.')) return { authenticated: true, user };
      if (channel.startsWith('center')) return center;
      if (channel.startsWith('sync.')) return { pending: 0, conflicts: 0 };
      return {};
    };
    const noop = () => () => {};
    window.api = new Proxy(
      { invoke: async (c) => respond(c), on: noop, off: noop, once: noop, send: () => {}, removeListener: noop, removeAllListeners: noop },
      { get(t, p) { return p in t ? t[p] : noop; } },
    );
  };
}

async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('#main-content');
    const grid = main ? main.querySelector('.overflow-auto') : null;
    const of = (el) => (el ? el.scrollHeight - el.clientHeight : null);
    return {
      dir: de.getAttribute('dir') || getComputedStyle(document.body).direction,
      html: { sh: de.scrollHeight, ch: de.clientHeight, of: of(de) },
      body: { sh: document.body.scrollHeight, ch: document.body.clientHeight, of: document.body.scrollHeight - document.body.clientHeight },
      main: main ? { sh: main.scrollHeight, ch: main.clientHeight, of: of(main) } : null,
      grid: grid ? { sh: grid.scrollHeight, ch: grid.clientHeight, of: of(grid) } : null,
    };
  });
}

const results = [];
const { server, port } = await startServer();
const url = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({ executablePath: CHROME });
await mkdir(SHOTS, { recursive: true });

for (const locale of LOCALES) {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, locale: locale === 'ar' ? 'ar-MA' : 'fr-FR' });
    await ctx.addInitScript(initScript(locale), locale);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('' + e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // The renderer defaults to FR (locale comes from the Electron main env, absent
    // in Chromium). For AR, switch via the in-shell language toggle like a user,
    // then wait for the document to flip to dir="rtl".
    if (locale === 'ar') {
      await page.getByRole('button', { name: 'العربية', exact: true }).first().click();
      await page.waitForFunction(() => document.documentElement.getAttribute('dir') === 'rtl', null, { timeout: 8000 });
      await page.waitForTimeout(300);
    }

    await page.getByRole('link', { name: NAV[locale], exact: true }).click();
    await page.getByRole('heading', { name: TITLE[locale] }).waitFor({ timeout: 8000 });
    await page.getByText('22:00', { exact: true }).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);

    const m = await measure(page);

    // AC3 — header pinned + AC: grid actually scrolls its own content.
    const heading = page.getByRole('heading', { name: TITLE[locale] });
    const before = await heading.boundingBox();
    const scrolledTo = await page.evaluate(() => {
      const grid = document.querySelector('#main-content .overflow-auto');
      grid.scrollTop = 200;
      return { top: grid.scrollTop, mainTop: document.querySelector('#main-content').scrollTop };
    });
    await page.waitForTimeout(150);
    const after = await heading.boundingBox();
    const headingMoved = Math.abs((before?.y ?? 0) - (after?.y ?? 0));

    // AC6 — clipping check: bottom hour label reachable after scroll (not clipped away).
    const bottomVisibleAfterScroll = await page.getByText('22:00', { exact: true }).first().isVisible().catch(() => false);

    await page.screenshot({ path: join(SHOTS, `planning-${locale}-${size.w}x${size.h}.png`) });

    results.push({
      locale, size: `${size.w}x${size.h}`, sizeLabel: size.label, dir: m.dir,
      html_of: m.html.of, body_of: m.body.of,
      main_sh: m.main?.sh, main_ch: m.main?.ch, main_of: m.main?.of,
      grid_sh: m.grid?.sh, grid_ch: m.grid?.ch, grid_of: m.grid?.of,
      gridScrolledTo: scrolledTo.top, mainScrollTop: scrolledTo.mainTop,
      headingMovedPx: Math.round(headingMoved * 100) / 100,
      bottomVisibleAfterScroll,
      pageErrors: errs,
    });
    await ctx.close();
  }
}

await browser.close();
server.close();

console.log(JSON.stringify(results, null, 2));

// Derived PASS/FAIL summary.
console.log('\n================ SOU-247 SUMMARY ================');
for (const r of results) {
  const mainNoScroll = r.main_of <= 1 && r.html_of <= 1 && r.body_of <= 1;
  const gridScrolls = r.grid_of > 1;
  const headerPinned = r.headingMovedPx <= 1 && r.mainScrollTop === 0;
  const noClip = r.bottomVisibleAfterScroll === true;
  const noErr = r.pageErrors.length === 0;
  const dirOk = r.locale === 'ar' ? r.dir === 'rtl' : r.dir === 'ltr';
  console.log(
    `${r.locale.toUpperCase()} ${r.size} dir=${r.dir}: ` +
      `main.of=${r.main_of} grid.of=${r.grid_of} gridScrolledTo=${r.gridScrolledTo} mainScrollTop=${r.mainScrollTop} headMoved=${r.headingMovedPx}px | ` +
      `[oneScroll:${mainNoScroll && gridScrolls ? 'PASS' : 'FAIL'}] [pinned:${headerPinned ? 'PASS' : 'FAIL'}] [noClip:${noClip ? 'PASS' : 'FAIL'}] [dir:${dirOk ? 'PASS' : 'FAIL'}] [noErr:${noErr ? 'PASS' : 'FAIL'}]`,
  );
}
