import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl } from '../../../src/main/ipc/external-allowlist';

describe('isAllowedExternalUrl', () => {
  it('allows the whitelisted landing host over https', () => {
    expect(isAllowedExternalUrl('https://centresoutien.com/tarifs')).toBe(true);
    expect(isAllowedExternalUrl('https://www.centresoutien.com/tarifs')).toBe(true);
    expect(isAllowedExternalUrl('https://CentreSoutien.com/tarifs')).toBe(true);
  });

  it('refuses non-https schemes', () => {
    expect(isAllowedExternalUrl('http://centresoutien.com/tarifs')).toBe(false);
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('refuses other hosts, subdomains, and look-alikes', () => {
    expect(isAllowedExternalUrl('https://evil.com')).toBe(false);
    expect(isAllowedExternalUrl('https://blog.centresoutien.com')).toBe(false);
    expect(isAllowedExternalUrl('https://centresoutien.com.evil.com')).toBe(false);
    expect(isAllowedExternalUrl('https://centresoutien.evil.com')).toBe(false);
  });

  it('refuses malformed input', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false);
    expect(isAllowedExternalUrl('')).toBe(false);
  });
});
