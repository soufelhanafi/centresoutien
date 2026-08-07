import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsLicenseStore } from '../../src/data/license/fs-license-store';

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-license-store-'));
  filePath = join(dir, 'license.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FsLicenseStore', () => {
  it('writes the envelope verbatim to the license path', () => {
    new FsLicenseStore(filePath).save('{"claims":"abc","signature":"def"}');
    expect(readFileSync(filePath, 'utf8')).toBe('{"claims":"abc","signature":"def"}');
  });

  it('overwrites an existing license (re-activation after upgrade)', () => {
    writeFileSync(filePath, 'OLD');
    new FsLicenseStore(filePath).save('NEW');
    expect(readFileSync(filePath, 'utf8')).toBe('NEW');
  });
});
