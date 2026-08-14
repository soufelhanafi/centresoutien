import { describe, expect, it } from 'vitest';
import { detectMacArch, detectOs, recommendPlatform } from './os-detect';

describe('detectOs', () => {
  it('detects macOS regardless of architecture', () => {
    // Even Apple Silicon browsers ship a UA claiming "Intel Mac OS X" — the
    // family detector must not guess architecture from it.
    expect(
      detectOs(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('mac');
    expect(
      detectOs(
        'Mozilla/5.0 (Macintosh; ARM Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('mac');
  });

  it('detects Windows', () => {
    expect(
      detectOs(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('windows');
  });

  it('detects Linux', () => {
    expect(
      detectOs(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('linux');
  });

  it('excludes iOS (UA strings contain "Mac OS X")', () => {
    expect(
      detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
    ).toBe('other');
    expect(
      detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'),
    ).toBe('other');
  });

  it('falls back to other for unknown user agents', () => {
    expect(detectOs('')).toBe('other');
  });
});

describe('detectMacArch', () => {
  const hints = (architecture?: string) => ({
    getHighEntropyValues: async (): Promise<{ architecture?: string }> =>
      architecture === undefined ? {} : { architecture },
  });

  it('reads architecture from UA Client Hints', async () => {
    expect(await detectMacArch(hints('arm'))).toBe('arm');
    expect(await detectMacArch(hints('x86'))).toBe('x64');
  });

  it('returns null when hints are unavailable or withheld', async () => {
    expect(await detectMacArch(undefined)).toBe(null);
    expect(await detectMacArch(hints(undefined))).toBe(null);
    expect(await detectMacArch(hints('ia64'))).toBe(null);
  });

  it('returns null when getHighEntropyValues rejects', async () => {
    const flaky = {
      getHighEntropyValues: async () => {
        throw new Error('denied');
      },
    };
    expect(await detectMacArch(flaky)).toBe(null);
  });
});

describe('recommendPlatform', () => {
  it('always recommends Windows on Windows', () => {
    expect(recommendPlatform('windows', null)).toBe('windows');
    expect(recommendPlatform('windows', 'arm')).toBe('windows');
  });

  it('recommends the Mac card only when the architecture is known', () => {
    expect(recommendPlatform('mac', 'arm')).toBe('macAppleSilicon');
    expect(recommendPlatform('mac', 'x64')).toBe('macIntel');
  });

  it('recommends nothing on macOS when the architecture is unknown', () => {
    expect(recommendPlatform('mac', null)).toBe(null);
  });

  it('recommends nothing on Linux or unknown OS', () => {
    expect(recommendPlatform('linux', null)).toBe(null);
    expect(recommendPlatform('other', null)).toBe(null);
  });
});
