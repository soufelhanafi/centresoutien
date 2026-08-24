import { describe, expect, it } from 'vitest';
import {
  decodeHubTxt,
  encodeHubTxt,
  generatePairingToken,
  type HubTxtRecord,
} from '../../../src/main/hub-discovery/hub-service';

const TXT: HubTxtRecord = { centreId: 'local', centerCode: 'CS-CASA-001', name: 'Centre Al Ilm' };

describe('encodeHubTxt / decodeHubTxt', () => {
  it('round-trips the identity record', () => {
    expect(decodeHubTxt(encodeHubTxt(TXT))).toEqual(TXT);
  });

  it('never advertises a token — only identity fields are present', () => {
    expect(Object.keys(encodeHubTxt(TXT)).sort()).toEqual(['centerCode', 'centreId', 'name']);
  });

  it('decodes Buffer-valued TXT entries (Bonjour may hand back Buffers)', () => {
    const decoded = decodeHubTxt({
      centreId: Buffer.from('local'),
      centerCode: Buffer.from('CS-CASA-001'),
      name: Buffer.from('Centre Al Ilm'),
    });
    expect(decoded).toEqual(TXT);
  });

  it.each([
    ['missing field', { centreId: 'local', centerCode: 'CS-CASA-001' }],
    ['empty field', { centreId: 'local', centerCode: 'CS-CASA-001', name: '' }],
    ['non-object', 'nope'],
    ['null', null],
  ])('returns null for a foreign/malformed responder (%s)', (_label, input) => {
    expect(decodeHubTxt(input)).toBeNull();
  });
});

describe('generatePairingToken', () => {
  it('formats a grouped code from the unambiguous alphabet', () => {
    // Deterministic bytes → deterministic code; 0 maps to the first symbol.
    const token = generatePairingToken((size) => new Uint8Array(size));
    expect(token).toBe('0000-0000-0000');
  });

  it('maps each byte through the 32-symbol alphabet, excluding I/L/O/U', () => {
    const token = generatePairingToken((size) => Uint8Array.from({ length: size }, (_v, i) => i));
    // Bytes 0..11 → alphabet[0..11] with dashes after positions 3 and 7.
    expect(token).toBe('0123-4567-89AB');
    expect(token).not.toMatch(/[ILOU]/);
  });

  it('produces 12 symbols in three groups of four', () => {
    const token = generatePairingToken((size) => Uint8Array.from({ length: size }, () => 200));
    expect(token).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });
});
