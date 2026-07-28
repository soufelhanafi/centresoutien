import { readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';

/**
 * Versioned migration runner (SOU-18 / migration-authoring skill). Numbered
 * `00XX_name.sql` files apply in order, each in its own transaction, recorded in
 * `_schema_migrations` per database file. Replay is idempotent — a file 10
 * versions behind migrates cleanly to head.
 */
const MIGRATIONS_TABLE = '_schema_migrations';
const MIGRATION_FILE = /^(\d{4})_.*\.sql$/;

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => MIGRATION_FILE.test(f))
    .sort()
    .map((f) => {
      const match = MIGRATION_FILE.exec(f);
      // filtered above, so match is non-null
      const version = Number(match![1]);
      return { version, name: f, sql: readFileSync(join(dir, f), 'utf8') };
    });
}

function ensureMigrationsTable(db: DB): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
}

function appliedVersions(db: DB): Set<number> {
  ensureMigrationsTable(db);
  const rows = db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE}`).all() as { version: number }[];
  return new Set(rows.map((r) => r.version));
}

/**
 * Apply all pending migrations from `dir`, newest schema last. Each migration
 * runs in a transaction with its bookkeeping insert, so a failure rolls the
 * whole file back and leaves `_schema_migrations` accurate. Returns the versions
 * applied this run (empty when already at head).
 */
export function applyMigrations(
  db: DB,
  migrations: Migration[],
  now: () => Date = () => new Date(),
): number[] {
  const applied = appliedVersions(db);
  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((m) => !applied.has(m.version));

  const record = db.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`,
  );
  const apply = db.transaction((m: Migration) => {
    db.exec(m.sql);
    record.run(m.version, m.name, now().toISOString());
  });

  for (const migration of pending) apply(migration);
  return pending.map((m) => m.version);
}

export function runMigrations(db: DB, dir: string, now: () => Date = () => new Date()): number[] {
  return applyMigrations(db, loadMigrations(dir), now);
}

/**
 * Build a migration list from a `{ path: sql }` map — e.g. Vite's
 * `import.meta.glob('…/migrations/*.sql', { query: '?raw', eager: true })`, so
 * the SQL is bundled into the main process instead of read from disk at runtime
 * (survives packaging/asar). Non-migration filenames are ignored.
 */
export function toMigrations(files: Record<string, string>): Migration[] {
  return Object.entries(files)
    .map(([path, sql]) => {
      const name = path.split(/[\\/]/).pop() ?? path;
      const match = MIGRATION_FILE.exec(name);
      return match ? { version: Number(match[1]), name, sql } : null;
    })
    .filter((m): m is Migration => m !== null)
    .sort((a, b) => a.version - b.version);
}

/**
 * Snapshot the encrypted database to `dest` before migrating. Checkpoints the
 * WAL into the main file first so the byte copy is consistent; the copy stays
 * encrypted with the same key (CLAUDE.md: never route data through plaintext).
 */
export function backupDatabase(db: DB, dest: string): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
  copyFileSync(db.name, dest);
}
