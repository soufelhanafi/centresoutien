import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const ENTITIES_DIR = resolve(__dirname, '../../src/entities');

/**
 * Envelope fields that MUST NOT appear in local (non-synced) entities.
 * `createdAt` and `updatedAt` are excluded — local entities legitimately carry
 * those timestamps (e.g. AdminAccount, RecoveryCode, DeviceSession). Adding
 * them here would produce false positives.
 */
const SYNC_ONLY_ENVELOPE_FIELDS = [
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
  'security-question.ts',
];

const HELPER_FILES = ['envelope.ts', 'write.ts'];

function entityFiles(): string[] {
  return readdirSync(ENTITIES_DIR).filter(
    (filename) => filename.endsWith('.ts') && !HELPER_FILES.includes(filename),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function readEntitySourceClean(filename: string): string {
  const raw = readFileSync(resolve(ENTITIES_DIR, filename), 'utf-8');
  return stripComments(raw);
}

function referencesEnvelope(clean: string): boolean {
  return clean.includes('EntityEnvelope');
}

function definesULIDPrefix(clean: string): boolean {
  return /_ID_PREFIX\s*=\s*'[a-z]+'/.test(clean);
}

function definesBrandedType(clean: string): boolean {
  return clean.includes('Brand<string,');
}

function hasBrandedReadonlyId(clean: string): boolean {
  return /readonly\s+id\s*:\s*\w+Id\b/.test(clean);
}

function definesBannedSyncFields(clean: string): boolean {
  return SYNC_ONLY_ENVELOPE_FIELDS.some((field) =>
    new RegExp(`\\b${field}\\b`).test(clean),
  );
}

describe('Sync-safe entity envelope audit', () => {
  const files = entityFiles();

  test('every entity file is either synced or local', () => {
    expect(files.length).toBeGreaterThan(0);

    for (const filename of files) {
      const clean = readEntitySourceClean(filename);
      if (LOCAL_ENTITY_FILES.includes(filename)) {
        expect(
          !referencesEnvelope(clean),
          `${filename} is local but references EntityEnvelope`,
        ).toBe(true);
      } else {
        expect(
          referencesEnvelope(clean),
          `${filename} must reference EntityEnvelope (import or extend)`,
        ).toBe(true);
      }
    }
  });

  describe('synced entities', () => {
    const syncedFiles = files.filter((filename) => !LOCAL_ENTITY_FILES.includes(filename));

    for (const filename of syncedFiles) {
      const clean = readEntitySourceClean(filename);

      describe(filename, () => {
        test('defines a ULID prefix constant', () => {
          expect(definesULIDPrefix(clean)).toBe(true);
        });

        test('defines at least one branded ID type', () => {
          expect(definesBrandedType(clean)).toBe(true);
        });

        test('has readonly id with branded Id type', () => {
          expect(hasBrandedReadonlyId(clean)).toBe(true);
        });

        test('references EntityEnvelope', () => {
          expect(referencesEnvelope(clean)).toBe(true);
        });
      });
    }
  });

  describe('local entities (no sync envelope)', () => {
    for (const filename of LOCAL_ENTITY_FILES) {
      const clean = readEntitySourceClean(filename);

      describe(filename, () => {
        test('does not reference EntityEnvelope', () => {
          expect(referencesEnvelope(clean)).toBe(false);
        });

        test('does not define sync-only envelope fields', () => {
          expect(definesBannedSyncFields(clean)).toBe(false);
        });

        test('defines a branded ID type', () => {
          expect(definesBrandedType(clean)).toBe(true);
        });

        test('defines a ULID prefix', () => {
          expect(definesULIDPrefix(clean)).toBe(true);
        });

        test('has readonly id with branded Id type', () => {
          expect(hasBrandedReadonlyId(clean)).toBe(true);
        });
      });
    }
  });
});
