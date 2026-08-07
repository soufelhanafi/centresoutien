import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import type { Clock, CenterCode } from '@centresoutien/domain';
import { licenseFileNameForCenter } from '../../data/license/license-file-path';
import { centreDbFileName, openDatabase } from '../../data/sqlite/db';
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
  wipeDemoArtefacts(options.dir);
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
    });
  } finally {
    container.dispose();
  }
}

/**
 * Delete every demo artefact for `centreId: 'demo'` (SOU-110 wipe): the demo DB
 * + WAL/SHM sidecars, the hub store + sidecars, the demo logo file (the center
 * row's `logoPath`, resolved before the DB is dropped), and the demo license
 * file. Zero residue. Callers dispose the open demo container FIRST (the restore
 * file-swap discipline) so the files are deletable on every platform.
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
    rmSync(join(dir, logoPath), { force: true });
  }
}

/** Resolve the demo center's logo path (its `centers.logo_path`) before wiping. */
export function readDemoLogoPath(db: DB): string | null {
  const row = db.prepare('SELECT logo_path FROM centers LIMIT 1').get() as
    | { logo_path: string | null }
    | undefined;
  return row?.logo_path ?? null;
}

/** Convenience: the demo center's code as a branded value. */
export function demoCenterCode(): CenterCode {
  return DEMO_CENTER_CODE;
}
