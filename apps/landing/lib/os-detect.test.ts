import { describe, expect, it } from 'vitest';
import { detectOs } from './os-detect';

describe('detectOs', () => {
  it('detects Apple Silicon macOS', () => {
    expect(
      detectOs(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('mac-intel');
    expect(
      detectOs(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
      ),
    ).toBe('mac-intel');
    expect(
      detectOs(
        'Mozilla/5.0 (Macintosh; ARM Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('mac-apple-silicon');
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

  it('falls back to other for unknown user agents', () => {
    expect(detectOs('')).toBe('other');
    expect(
      detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
    ).toBe('other');
    expect(
      detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'),
    ).toBe('other');
  });
});
