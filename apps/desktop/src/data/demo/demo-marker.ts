import type { Database as DB } from 'better-sqlite3';

/**
 * SOU-110 — the demo-seeded marker, stored in the LOCAL `app_meta` table (the
 * one exception to "never write raw SQL": `resolveDeviceOrigin` already does the
 * same). Its presence means the demo center DB was fully seeded; its absence
 * means "fresh demo DB, run the seeder before opening the window".
 */

export const DEMO_SEEDED_KEY = 'demo_seeded';
export const DEMO_SEEDED_VALUE = '1';

export function demoSeededMarker(db: DB): boolean {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(DEMO_SEEDED_KEY) as
    | { value: string }
    | undefined;
  return row?.value === DEMO_SEEDED_VALUE;
}

export function writeDemoSeededMarker(db: DB): void {
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
    DEMO_SEEDED_KEY,
    DEMO_SEEDED_VALUE,
  );
}
