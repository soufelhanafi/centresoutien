import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import type { Clock, CenterCode } from '@centresoutien/domain';
import { licenseFileNameForCenter } from '../../data/license/license-file-path';
import { centreDbFileName, openDatabase } from '../../data/sqlite/db';
import { resolveInsideLogoDir } from '../../data/fs/logo-store';
import { hubDbFileName } from '../../data/sqlite/hub/hub-store';
import { DEMO_CENTER_CODE, DEMO_LICENSE_FILE } from '../../data/demo/demo-license';
import { DEMO_ANCHOR_UTC } from '../../data/demo/demo-dataset';
import { DemoIdGenerator } from '../../data/demo/demo-id-generator';
import { demoSeededMarker } from '../../data/demo/demo-marker';
import { seedDemoCenter } from '../../data/demo/demo-seeder';
import { buildContainer } from '../composition-root';

/** The demo center's fixed clock — "today" is always the Sept 2026 anchor. */
export const demoClock: Clock = { now: () => new Date(DEMO_ANCHOR_UTC) };

/** The demo center's fixed centreId — its own SQLCipher file, its own key. */
export const DEMO_CENTRE_ID = 'demo';

/** Whether a demo DB exists at `dir` AND has the seeded marker. */
export function demoCenterSeeded(dir: string, key: string): boolean {
  const file = join(dir, centreDbFileName(DEMO_CENTRE_ID));
  if (!existsSync(file)) return false;
  let db: ReturnType<typeof openDatabase> | null = null;
  try {
    db = openDatabase({ centreId: DEMO_CENTRE_ID, key, dir });
    return demoSeededMarker(db);
  } catch {
    // A partial/corrupt demo file (crash before migrations) is NOT seeded —
    // treat it as fresh and let prepareDemoCenter wipe + reseed it.
    return false;
  } finally {
    db?.close();
  }
}

/** (Re)write the demo center's license file — idempotent. */
export function writeDemoLicenseFile(dir: string): void {
  writeFileSync(join(dir, licenseFileNameForCenter(DEMO_CENTER_CODE)), DEMO_LICENSE_FILE);
}

export type PrepareDemoCenterOptions = {
  dir: string;
  /** The demo DB key — `resolveCenterKey(vault, 'demo')`. */
  demoKey: string;
  appVersion: () => string;
  /** Restart callback the transient seed container receives (unused for seeding). */
  scheduleRestart: () => void;
  /**
   * The demo admin credentials to seed the login with (SOU-186), resolved from
   * the environment by the main entry BEFORE seeding so seeding fails loud when
   * they are unset. No credential literal ever lives in source.
   */
  admin: { username: string; password: string };
};

/**
 * Build a fully seeded demo center from scratch (SOU-110): wipe any previous
 * demo artefacts, write the demo license, open + migrate the demo DB, build a
 * demo container under the fixed clock + deterministic ids, drive the seeder
 * through the WIRED use cases (envelopes/change-log/plan-gates respected), and
 * close it. Deterministic by construction — the same dataset, clock, and ids.
 *
 * The seeded DB is left on disk ready for `demo.create`'s relaunch (or a first
 * open of a fresh demo DB); this function itself never relaunches.
 */
export async function prepareDemoCenter(options: PrepareDemoCenterOptions): Promise<void> {
  // A prior demo session may have crashed/killed (the only non-wipe exit) after
  // uploading a logo; resolve it from the old DB before it is wiped so the seed
  // leaves zero residue (review m2).
  let previousLogoPath: string | null = null;
  const previousFile = join(options.dir, centreDbFileName(DEMO_CENTRE_ID));
  if (existsSync(previousFile)) {
    let probe: DB | null = null;
    try {
      probe = openDatabase({ centreId: DEMO_CENTRE_ID, key: options.demoKey, dir: options.dir });
      previousLogoPath = readDemoLogoPath(probe);
    } catch {
      // Partial/corrupt demo file — nothing to resolve; the wipe below drops it.
      previousLogoPath = null;
    } finally {
      probe?.close();
    }
  }
  wipeDemoArtefacts(options.dir, previousLogoPath);
  writeDemoLicenseFile(options.dir);

  const container = buildContainer({
    centreId: DEMO_CENTRE_ID,
    centerCode: DEMO_CENTER_CODE,
    key: options.demoKey,
    dir: options.dir,
    planId: 'premium',
    appVersion: options.appVersion,
    scheduleRestart: options.scheduleRestart,
    // The demo runs on a fixed clock + deterministic ids so every seed (and the
    // running demo's "today" reads) is byte-identical.
    clock: demoClock,
    ids: new DemoIdGenerator(),
  });

  try {
    const deps = container.handlerDeps;
    const envelope = deps.envelopeContext();
    await seedDemoCenter(deps, {
      centerCode: DEMO_CENTER_CODE,
      deviceOrigin: envelope.deviceOrigin,
      updatedBy: envelope.updatedBy,
      db: container.db,
      seedPlan: 'premium',
      admin: options.admin,
    });
  } finally {
    container.dispose();
  }
}

/**
 * Delete every demo artefact for `centreId: 'demo'` (SOU-110 wipe): the demo DB
 * + WAL/SHM sidecars, the hub store + sidecars, the demo logo file (the center
 * row's `logoPath`, resolved before the DB is dropped), and the demo license
 * file. Zero residue in userData. The keychain entry the demo key derives from
 * (SOU-179) is intentionally retained — it is opaque without the DB and deleting
 * keychain entries is riskier than leaving it (review m4). Callers dispose the
 * open demo container FIRST (the restore file-swap discipline) so the files are
 * deletable on every platform.
 */
export function wipeDemoArtefacts(dir: string, logoPath: string | null = null): void {
  const files = [
    centreDbFileName(DEMO_CENTRE_ID),
    `${centreDbFileName(DEMO_CENTRE_ID)}-wal`,
    `${centreDbFileName(DEMO_CENTRE_ID)}-shm`,
    hubDbFileName(DEMO_CENTRE_ID),
    `${hubDbFileName(DEMO_CENTRE_ID)}-wal`,
    `${hubDbFileName(DEMO_CENTRE_ID)}-shm`,
    licenseFileNameForCenter(DEMO_CENTER_CODE),
  ];
  for (const name of files) {
    rmSync(join(dir, name), { force: true });
  }
  if (logoPath !== null && logoPath !== '') {
    // Delete through the same traversal guard the read path uses (SOU-110 m1):
    // a poisoned `centers.logo_path` can never make the wipe rm a file outside
    // `<dir>/logos/`. A safe `logos/lgo_….png` resolves; anything else no-ops.
    const safeLogoFile = resolveInsideLogoDir(dir, logoPath);
    if (safeLogoFile !== null) rmSync(safeLogoFile, { force: true });
  }
}

/** Resolve the demo center's logo path (its `center.logo_path`) before wiping. */
export function readDemoLogoPath(db: DB): string | null {
  const row = db.prepare('SELECT logo_path FROM center LIMIT 1').get() as
    | { logo_path: string | null }
    | undefined;
  return row?.logo_path ?? null;
}

/** Convenience: the demo center's code as a branded value. */
export function demoCenterCode(): CenterCode {
  return DEMO_CENTER_CODE;
}
