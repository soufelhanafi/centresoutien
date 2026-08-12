import { describe, expect, it } from 'vitest';
import {
  isTrustedIpcSender,
  isTrustedRendererUrl,
  resolveTrustedRendererOrigin,
  type TrustedRendererOrigin,
} from '../../../src/main/security/renderer-origin';

/**
 * SOU-236 — the pure trust policy behind the IPC sender guard and the
 * will-navigate guard. Electron-free: exercises the exact decisions
 * (dev vs packaged origin, subframe rejection, scheme rejection) without a shell.
 */

const DEV: TrustedRendererOrigin = { kind: 'dev', origin: 'http://localhost:5173' };
const FILE: TrustedRendererOrigin = { kind: 'file' };

describe('resolveTrustedRendererOrigin', () => {
  it('is the packaged file origin when no dev URL is present', () => {
    expect(resolveTrustedRendererOrigin(undefined)).toEqual({ kind: 'file' });
  });

  it('is the dev server origin (path and query stripped) when a dev URL is present', () => {
    expect(resolveTrustedRendererOrigin('http://localhost:5173/index.html?locale=fr')).toEqual({
      kind: 'dev',
      origin: 'http://localhost:5173',
    });
  });

  it('falls back to file rather than trusting an unparseable dev URL', () => {
    expect(resolveTrustedRendererOrigin('not a url')).toEqual({ kind: 'file' });
  });
});

describe('isTrustedRendererUrl', () => {
  const cases: ReadonlyArray<[TrustedRendererOrigin, string, boolean]> = [
    [FILE, 'file:///Users/x/app/renderer/index.html', true],
    [FILE, 'file:///Users/x/app/renderer/index.html?locale=ar', true],
    [FILE, 'https://centresoutien.com', false],
    [FILE, 'http://localhost:5173', false],
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
    expect(
      isTrustedIpcSender({ url: 'file:///Users/x/app/index.html', hasParent: false }, FILE),
    ).toBe(true);
  });

  it('rejects a subframe even when its origin matches', () => {
    expect(isTrustedIpcSender({ url: 'http://localhost:5173/', hasParent: true }, DEV)).toBe(false);
  });

  it('rejects a top frame on a foreign origin', () => {
    expect(isTrustedIpcSender({ url: 'https://evil.com', hasParent: false }, DEV)).toBe(false);
  });

  it('rejects a missing frame', () => {
    expect(isTrustedIpcSender(null, DEV)).toBe(false);
  });
});
