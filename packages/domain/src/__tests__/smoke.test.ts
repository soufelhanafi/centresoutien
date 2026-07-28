import { describe, expect, it } from 'vitest';
import { DOMAIN_PACKAGE } from '../index';

describe('@centresoutien/domain', () => {
  it('exposes its package identity and evaluates with no DOM', () => {
    expect(DOMAIN_PACKAGE).toBe('@centresoutien/domain');
    // Guard: the portable core must never reference browser globals.
    expect(typeof globalThis).toBe('object');
    expect('document' in globalThis).toBe(false);
  });
});
