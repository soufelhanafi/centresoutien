import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const MIGRATIONS_DIR = resolve(
  __dirname,
  '../../../..',
  'apps/desktop/src/data/sqlite/migrations',
);

const ENVELOPE_COLUMNS = [
  { name: 'id', type: 'TEXT PRIMARY KEY' },
  { name: 'center_code', type: 'TEXT NOT NULL' },
  { name: 'device_origin', type: 'TEXT NOT NULL' },
  { name: 'created_at', type: 'TEXT NOT NULL' },
  { name: 'updated_at', type: 'TEXT NOT NULL' },
  { name: 'updated_by', type: 'TEXT NOT NULL' },
  { name: 'deleted_at', type: 'TEXT' },
  { name: 'version', type: 'INTEGER NOT NULL DEFAULT 0' },
];

const LOCAL_TABLES = [
  'admin_accounts',
  'app_meta',
  'auth_lockout',
  'device_sessions',
  'recovery_codes',
  'auth_audit_log',
];

interface ColumnDef {
  name: string;
  definition: string;
}

interface TableDef {
  name: string;
  columns: ColumnDef[];
  raw: string;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf-8');
}

function extractCreateTables(sql: string): TableDef[] {
  const tables: TableDef[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const name = match[1]!;
    const body = match[2]!;
    const columns = extractColumns(body);
    tables.push({ name, columns, raw: match[0]! });
  }
  return tables;
}

function extractColumns(createBody: string): ColumnDef[] {
  const columns: ColumnDef[] = [];
  const lines = createBody.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    if (/^(?:CHECK|UNIQUE|PRIMARY|FOREIGN|CONSTRAINT)/i.test(trimmed)) continue;

    const colMatch = trimmed.match(/^(\w+)\s+(.+)$/);
    if (colMatch) {
      columns.push({ name: colMatch[1]!, definition: trimmed });
    }
  }
  return columns;
}

function hasColumn(table: TableDef, columnName: string): boolean {
  return table.columns.some((c) => c.name === columnName);
}

function columnMatches(
  table: TableDef,
  columnName: string,
  expectedType: string,
): boolean {
  const col = table.columns.find((c) => c.name === columnName);
  if (!col) return false;
  const def = col.definition.replace(/\s+/g, ' ').trim();
  const expected = `${columnName} ${expectedType}`.replace(/\s+/g, ' ').trim();
  return def.startsWith(expected);
}

function hasAutoincrement(sql: string): boolean {
  return /AUTOINCREMENT/i.test(sql);
}

function hasHardDelete(sql: string): boolean {
  const noComments = sql.replace(/--.*$/gm, '');
  return /\bDELETE\s+FROM\b/i.test(noComments);
}

function hasIntegerPrimaryKey(table: TableDef): boolean {
  return table.columns.some(
    (c) =>
      c.name === 'id' && /INTEGER\s+PRIMARY\s+KEY/i.test(c.definition),
  );
}

describe('Migration sync-safe audit', () => {
  const files = migrationFiles();
  const allTables: Array<{ table: TableDef; filename: string }> = [];

  for (const filename of files) {
    const sql = readMigration(filename);
    const tables = extractCreateTables(sql);

    for (const table of tables) {
      allTables.push({ table, filename });
    }
  }

  test('migration files exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe('AUTOINCREMENT ban', () => {
    for (const filename of files) {
      const sql = readMigration(filename);
      test(`${filename} has no AUTOINCREMENT`, () => {
        expect(hasAutoincrement(sql), 'AUTOINCREMENT found').toBe(false);
      });
    }
  });

  describe('hard DELETE ban', () => {
    for (const filename of files) {
      const sql = readMigration(filename);
      test(`${filename} has no hard DELETE`, () => {
        expect(hasHardDelete(sql), 'hard DELETE FROM found').toBe(false);
      });
    }
  });

  describe('synced table envelope columns', () => {
    for (const { table, filename } of allTables) {
      if (LOCAL_TABLES.includes(table.name)) continue;
      const hasCenterCode = hasColumn(table, 'center_code');
      if (!hasCenterCode) continue;

      describe(`${table.name} (${filename})`, () => {
        for (const envCol of ENVELOPE_COLUMNS) {
          test(`has ${envCol.name} ${envCol.type}`, () => {
            expect(
              columnMatches(table, envCol.name, envCol.type),
              `expected column "${envCol.name} ${envCol.type}"`,
            ).toBe(true);
          });
        }
      });
    }
  });

  describe('no INTEGER PRIMARY KEY on entity tables', () => {
    for (const { table, filename } of allTables) {
      if (LOCAL_TABLES.includes(table.name)) continue;
      test(`${table.name} (${filename}) has TEXT PRIMARY KEY id`, () => {
        expect(
          hasIntegerPrimaryKey(table),
          `${table.name} must use TEXT PRIMARY KEY for ULID id`,
        ).toBe(false);
      });
    }
  });

  describe('local tables are accounted for', () => {
    for (const { table, filename } of allTables) {
      const hasCenterCode = hasColumn(table, 'center_code');
      if (hasCenterCode) continue;
      test(`${table.name} (${filename}) is a known local table`, () => {
        expect(LOCAL_TABLES, `${table.name} not in LOCAL_TABLES`).toContain(
          table.name,
        );
      });
    }
  });
});
