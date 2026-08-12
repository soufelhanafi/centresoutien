import { describe, expect, it } from 'vitest';
import {
  isTrustedIpcSender,
  isTrustedRendererUrl,
  resolveTrustedRendererOrigin,
  type TrustedRendererOrigin,
} from '../../../src/main/security/renderer-origin';

/**
 * SOU-236 / SOU-242 — the pure trust policy behind the IPC sender guard and the
 * will-navigate guard. Electron-free: exercises the exact decisions (dev vs
 * packaged origin, subframe rejection, scheme rejection, and the packaged
 * file:-path pin) without a shell.
 */

const DEV: TrustedRendererOrigin = { kind: 'dev', origin: 'http://localhost:5173' };

const INDEX_URL = 'file:///Users/x/app/out/renderer/index.html';
const FILE: TrustedRendererOrigin = { kind: 'file', indexUrl: INDEX_URL };

// A packaged Windows install: pathToFileURL produces `file:///C:/…` with the
// space percent-encoded. The pin must accept this exact entry and reject any
// other local path on the same volume (SOU-242 cross-platform requirement).
const WIN_INDEX_URL =
  'file:///C:/Program%20Files/CentreSoutien/resources/app.asar/out/renderer/index.html';
const WIN_FILE: TrustedRendererOrigin = { kind: 'file', indexUrl: WIN_INDEX_URL };

describe('resolveTrustedRendererOrigin', () => {
  it('pins the packaged file entry to the given index path when no dev URL is present', () => {
    expect(resolveTrustedRendererOrigin(undefined, INDEX_URL)).toEqual({
      kind: 'file',
      indexUrl: INDEX_URL,
    });
  });

  it('is the dev server origin (path and query stripped) when a dev URL is present', () => {
    expect(
      resolveTrustedRendererOrigin('http://localhost:5173/index.html?locale=fr', INDEX_URL),
    ).toEqual({ kind: 'dev', origin: 'http://localhost:5173' });
  });

  it('falls back to the pinned file entry rather than trusting an unparseable dev URL', () => {
    expect(resolveTrustedRendererOrigin('not a url', INDEX_URL)).toEqual({
      kind: 'file',
      indexUrl: INDEX_URL,
    });
  });
});

describe('isTrustedRendererUrl', () => {
  const cases: ReadonlyArray<[TrustedRendererOrigin, string, boolean]> = [
    // The pinned entry itself passes; search and hash are ignored (loadFile adds
    // ?locale=…, the SPA routes on the hash).
    [FILE, INDEX_URL, true],
    [FILE, `${INDEX_URL}?locale=ar`, true],
    [FILE, `${INDEX_URL}#/students`, true],
    // The SOU-242 pin: a different local file is refused, not trusted by scheme.
    [FILE, 'file:///Users/x/app/out/renderer/other.html', false],
    [FILE, 'file:///etc/passwd', false],
    [FILE, 'https://centresoutien.com', false],
    [FILE, 'http://localhost:5173', false],
    // Windows-style pinned entry: exact path passes, any other local path fails.
    [WIN_FILE, WIN_INDEX_URL, true],
    [WIN_FILE, `${WIN_INDEX_URL}?locale=fr`, true],
    // Drive-letter casing folded: a lower-case `c:` frame URL (Chromium) still
    // matches the upper-case `C:` pin (Node's pathToFileURL) — not an x===x check.
    [WIN_FILE, WIN_INDEX_URL.replace('/C:/', '/c:/'), true],
    [WIN_FILE, 'file:///C:/Windows/System32/calc.html', false],
    [DEV, 'http://localhost:5173/', true],
    [DEV, 'http://localhost:5173/students?q=1', true],
    [DEV, 'http://localhost:6006/', false],
    [DEV, 'https://localhost:5173/', false],
    [DEV, 'file:///Users/x/app/index.html', false],
    [DEV, 'https://evil.com', false],
    [FILE, 'not a url', false],
    [DEV, 'javascript:alert(1)', false],
  ];

  it.each(cases)('%o + %s → %s', (trusted, url, expected) => {
    expect(isTrustedRendererUrl(url, trusted)).toBe(expected);
  });
});

describe('isTrustedIpcSender', () => {
  it('trusts the top frame of the trusted origin', () => {
    expect(isTrustedIpcSender({ url: 'http://localhost:5173/', hasParent: false }, DEV)).toBe(true);
    expect(isTrustedIpcSender({ url: INDEX_URL, hasParent: false }, FILE)).toBe(true);
  });

  it('rejects a top frame on a foreign file path even under the packaged pin', () => {
    expect(
      isTrustedIpcSender({ url: 'file:///Users/x/app/out/renderer/other.html', hasParent: false }, FILE),
    ).toBe(false);
  });

  it('rejects a subframe even when its origin matches', () => {
    expect(isTrustedIpcSender({ url: 'http://localhost:5173/', hasParent: true }, DEV)).toBe(false);
    expect(isTrustedIpcSender({ url: INDEX_URL, hasParent: true }, FILE)).toBe(false);
  });

  it('rejects a top frame on a foreign origin', () => {
    expect(isTrustedIpcSender({ url: 'https://evil.com', hasParent: false }, DEV)).toBe(false);
  });

  it('rejects a missing frame', () => {
    expect(isTrustedIpcSender(null, DEV)).toBe(false);
  });
});
