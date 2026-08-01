import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalePreferenceStore } from '../../../src/main/infra/locale-preference-store';

let dir: string;
let store: LocalePreferenceStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-locale-'));
  store = new LocalePreferenceStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('LocalePreferenceStore', () => {
  it('reads null when no preference file exists yet', () => {
    expect(store.read()).toBeNull();
  });

  it('round-trips a written locale', () => {
    store.write('ar');
    expect(store.read()).toBe('ar');
  });

  it('overwrites a previously written locale', () => {
    store.write('ar');
    store.write('fr');
    expect(store.read()).toBe('fr');
  });

  it('reads null for a corrupted preference file instead of throwing', () => {
    writeFileSync(join(dir, 'preferences.json'), '{not json');
    expect(store.read()).toBeNull();
  });

  it('reads null for an unrecognized locale value', () => {
    writeFileSync(join(dir, 'preferences.json'), JSON.stringify({ locale: 'es' }));
    expect(store.read()).toBeNull();
  });

  it('creates the userData directory on first write if missing', () => {
    const fresh = new LocalePreferenceStore(join(dir, 'nested', 'deeper'));
    fresh.write('fr');
    expect(fresh.read()).toBe('fr');
  });
});
