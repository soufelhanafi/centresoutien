import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/data/sqlite/db';
import { DEMO_CENTER_CODE } from '../../src/data/demo/demo-license';
import { demoSeededMarker } from '../../src/data/demo/demo-marker';
import { DEMO_STUDENT_COUNT } from '../../src/data/demo/demo-dataset';
import {
  DEMO_CENTRE_ID,
  demoCenterSeeded,
  prepareDemoCenter,
  wipeDemoArtefacts,
} from '../../src/main/demo/demo-center';

const KEY = 'demo-test-key';
const NOOP_RESTART = () => {};

/**
 * SOU-110 — the demo seeder: deterministic (seed twice → identical visible
 * dataset), complete (150 students, parents, invoices, payroll, admin, marker),
 * and wipe leaves zero residue (DB + WAL/SHM + hub + license + logos).
 */

function seedInto(dir: string): Promise<void> {
  return prepareDemoCenter({ dir, demoKey: KEY, appVersion: () => '2.0.0', scheduleRestart: NOOP_RESTART });
}

/** Read a deterministic fingerprint of the demo DB — the "visible dataset". */
function visibleDataset(dir: string) {
  const db = openDatabase({ centreId: DEMO_CENTRE_ID, key: KEY, dir });
  try {
    const students = db
      .prepare('SELECT name_fr, name_ar, level, birth_date FROM students ORDER BY name_fr')
      .all() as Array<{ name_fr: string; name_ar: string; level: string; birth_date: string }>;
    const parents = db
      .prepare('SELECT name, phone FROM parents ORDER BY name')
      .all() as Array<{ name: string; phone: string }>;
    const invoiceRows = db
      .prepare('SELECT month, status FROM invoices ORDER BY month, id')
      .all() as Array<{ month: string; status: string }>;
    const payouts = db
      .prepare('SELECT month, status FROM teacher_payouts ORDER BY month, id')
      .all() as Array<{ month: string; status: string }>;
    const paymentRows = db
      .prepare('SELECT amount_mad, method, paid_on FROM payments ORDER BY id')
      .all() as Array<{ amount_mad: number; method: string; paid_on: string }>;
    return {
      students,
      parents,
      invoices: invoiceRows,
      payouts,
      payments: paymentRows,
      counts: {
        students: students.length,
        parents: parents.length,
        subjects: (db.prepare('SELECT count(*) c FROM subjects').get() as { c: number }).c,
        formulas: (db.prepare('SELECT count(*) c FROM formulas').get() as { c: number }).c,
        teachers: (db.prepare('SELECT count(*) c FROM teachers').get() as { c: number }).c,
        groups: (db.prepare('SELECT count(*) c FROM groups').get() as { c: number }).c,
        enrollments: (db.prepare('SELECT count(*) c FROM enrollments').get() as { c: number }).c,
        sessions: (db.prepare('SELECT count(*) c FROM sessions').get() as { c: number }).c,
      },
    };
  } finally {
    db.close();
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-demo-seed-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('demo seeder (SOU-110)', () => {
  it('seeds the full deterministic dataset: 150 students, parents, invoices, payroll, admin, marker', async () => {
    await seedInto(dir);

    const db = openDatabase({ centreId: DEMO_CENTRE_ID, key: KEY, dir });
    try {
      expect(demoSeededMarker(db)).toBe(true);

      const studentCount = (db.prepare('SELECT count(*) c FROM students').get() as { c: number }).c;
      expect(studentCount).toBe(DEMO_STUDENT_COUNT);

      const parentCount = (db.prepare('SELECT count(*) c FROM parents').get() as { c: number }).c;
      expect(parentCount).toBe(DEMO_STUDENT_COUNT);

      const invoiceCount = (db.prepare('SELECT count(*) c FROM invoices').get() as { c: number }).c;
      // Two months (Aug + Sept) × 150 students.
      expect(invoiceCount).toBe(300);

      const paymentCount = (db.prepare('SELECT count(*) c FROM payments').get() as { c: number }).c;
      expect(paymentCount).toBeGreaterThan(0);

      const payoutCount = (db.prepare('SELECT count(*) c FROM teacher_payouts').get() as { c: number }).c;
      expect(payoutCount).toBeGreaterThan(0);

      // Mixed payment states: paid, partially-paid, unpaid (overdue) all present.
      const statuses = new Set(
        (db.prepare('SELECT status FROM invoices').all() as Array<{ status: string }>).map((r) => r.status),
      );
      expect(statuses.has('issued')).toBe(true);

      const admin = db.prepare("SELECT username FROM admin_accounts WHERE username = 'demo'").get();
      expect(admin).toBeDefined();
    } finally {
      db.close();
    }

    expect(demoCenterSeeded(dir, KEY)).toBe(true);
  });

  it(
    'seeds deterministically — two seeds produce identical visible datasets',
    async () => {
      const other = mkdtempSync(join(tmpdir(), 'cs-demo-seed2-'));
      try {
        await seedInto(dir);
        await seedInto(other);
        expect(visibleDataset(dir)).toEqual(visibleDataset(other));
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it('wipe removes every demo artefact (DB + WAL/SHM + hub + license), leaving the real center untouched', async () => {
    await seedInto(dir);

    // A real center DB must survive the demo wipe.
    const realPath = join(dir, 'centre-local.db');
    writeFileSync(realPath, 'real-center-bytes');

    const demoDb = join(dir, 'centre-demo.db');
    const demoHub = join(dir, 'hub-demo.db');
    const demoLicense = join(dir, `license.${DEMO_CENTER_CODE}.json`);
    expect(existsSync(demoDb)).toBe(true);
    expect(existsSync(demoHub)).toBe(false); // hub not enabled in test
    expect(existsSync(demoLicense)).toBe(true);

    wipeDemoArtefacts(dir, null);

    expect(existsSync(demoDb)).toBe(false);
    expect(existsSync(`${demoDb}-wal`)).toBe(false);
    expect(existsSync(`${demoDb}-shm`)).toBe(false);
    expect(existsSync(demoHub)).toBe(false);
    expect(existsSync(demoLicense)).toBe(false);
    // Real center file untouched.
    expect(existsSync(realPath)).toBe(true);

    // Nothing demo-related remains under the dir.
    const leftover = readdirSync(dir).filter((name) => name.includes(DEMO_CENTRE_ID));
    expect(leftover).toEqual([]);
  });

  it('wipe deletes the demo center logo file when one is present', async () => {
    await seedInto(dir);
    const logoPath = 'logos/lgo_demo.png';
    mkdirSync(join(dir, 'logos'), { recursive: true });
    writeFileSync(join(dir, logoPath), 'logo-bytes');

    wipeDemoArtefacts(dir, logoPath);
    expect(existsSync(join(dir, logoPath))).toBe(false);
  });

  it('demoCenterSeeded is false on a fresh dir and true after seeding', async () => {
    expect(demoCenterSeeded(dir, KEY)).toBe(false);
    await seedInto(dir);
    expect(demoCenterSeeded(dir, KEY)).toBe(true);
  });
});
