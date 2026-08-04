import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const ENTITIES_DIR = resolve(__dirname, '../../src/entities');

const SYNC_ENVELOPE_FIELDS = [
  'centerCode',
  'deviceOrigin',
  'updatedBy',
  'deletedAt',
  'version',
] as const;

const LOCAL_ENTITY_FILES = [
  'admin-account.ts',
  'auth-audit-event.ts',
  'device-session.ts',
  'recovery-code.ts',
];

const HELPER_FILES = ['envelope.ts', 'write.ts'];

function entityFiles(): string[] {
  return readdirSync(ENTITIES_DIR).filter(
    (f) => f.endsWith('.ts') && !HELPER_FILES.includes(f),
  );
}

function readEntitySource(filename: string): string {
  return readFileSync(resolve(ENTITIES_DIR, filename), 'utf-8');
}

function referencesEnvelope(source: string): boolean {
  return source.includes('EntityEnvelope');
}

function definesULIDPrefix(source: string): boolean {
  return /_ID_PREFIX\s*=\s*'[a-z]+'/.test(source);
}

function definesBrandedType(source: string): boolean {
  return source.includes('Brand<string,');
}

function hasBrandedReadonlyId(source: string): boolean {
  return /readonly\s+id\s*:\s*\w+Id\b/.test(source);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/.*$/gm, ''); // line comments
}

function definesBannedSyncFields(source: string): boolean {
  const clean = stripComments(source);
  return SYNC_ENVELOPE_FIELDS.some((field) =>
    new RegExp(`\\b${field}\\b`).test(clean),
  );
}

describe('Sync-safe entity envelope audit', () => {
  const files = entityFiles();

  test('every entity file is either synced or local', () => {
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      const source = readEntitySource(f);
      if (LOCAL_ENTITY_FILES.includes(f)) {
        expect(
          !referencesEnvelope(source),
          `${f} is local but references EntityEnvelope`,
        ).toBe(true);
      } else {
        expect(
          referencesEnvelope(source),
          `${f} must reference EntityEnvelope (import or extend)`,
        ).toBe(true);
      }
    }
  });

  describe('synced entities', () => {
    const syncedFiles = files.filter((f) => !LOCAL_ENTITY_FILES.includes(f));

    for (const filename of syncedFiles) {
      const source = readEntitySource(filename);

      describe(filename, () => {
        test('defines a ULID prefix constant', () => {
          expect(
            definesULIDPrefix(source),
            `${filename} must define an _ID_PREFIX constant`,
          ).toBe(true);
        });

        test('defines at least one branded ID type', () => {
          expect(
            definesBrandedType(source),
            `${filename} must define Brand<string, ...>`,
          ).toBe(true);
        });

        test('has readonly id with branded Id type', () => {
          expect(
            hasBrandedReadonlyId(source),
            `${filename} must have readonly id: SomeId`,
          ).toBe(true);
        });

        test('references EntityEnvelope', () => {
          expect(
            referencesEnvelope(source),
            `${filename} must reference EntityEnvelope`,
          ).toBe(true);
        });
      });
    }
  });

  describe('local entities (no sync envelope)', () => {
    for (const filename of LOCAL_ENTITY_FILES) {
      const source = readEntitySource(filename);

      describe(filename, () => {
        test('does not reference EntityEnvelope', () => {
          expect(referencesEnvelope(source)).toBe(false);
        });

        test('does not define sync envelope fields', () => {
          expect(
            definesBannedSyncFields(source),
            `${filename} must not have centerCode, deviceOrigin, updatedBy, deletedAt, or version`,
          ).toBe(false);
        });

        test('defines a branded ID type', () => {
          expect(definesBrandedType(source)).toBe(true);
        });

        test('defines a ULID prefix', () => {
          expect(definesULIDPrefix(source)).toBe(true);
        });

        test('has readonly id with branded Id type', () => {
          expect(hasBrandedReadonlyId(source)).toBe(true);
        });
      });
    }
  });
});
