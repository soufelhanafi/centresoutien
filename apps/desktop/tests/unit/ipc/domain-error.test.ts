import { describe, expect, it } from 'vitest';
import { encodeDomainError, decodeDomainError } from '../../../src/shared/ipc/domain-error';

describe('domain-error transport', () => {
  it('round-trips a code + message through encode → decode', () => {
    const encoded = encodeDomainError({ code: 'group-full', message: 'Group is full' });
    expect(decodeDomainError(encoded)).toEqual({ code: 'group-full', message: 'Group is full' });
  });

  it('decodes even when Electron prepends its remote-method prefix', () => {
    const encoded = encodeDomainError({ code: 'cross-kind-enrollment', message: 'wrong kind' });
    // Electron rejects invoke() with: "Error invoking remote method 'x': Error: <message>"
    const wrapped = `Error invoking remote method 'enrollment.create': Error: ${encoded}`;
    expect(decodeDomainError(wrapped)).toEqual({
      code: 'cross-kind-enrollment',
      message: 'wrong kind',
    });
  });

  it('returns null for a message with no envelope', () => {
    expect(decodeDomainError('just a plain error')).toBeNull();
    expect(decodeDomainError('')).toBeNull();
  });

  it('returns null when the envelope payload is malformed', () => {
    expect(decodeDomainError('@@CS_DOMAIN_ERROR@@not json@@CS_DOMAIN_ERROR@@')).toBeNull();
    // valid JSON but missing the required string fields
    expect(decodeDomainError('@@CS_DOMAIN_ERROR@@{"code":1}@@CS_DOMAIN_ERROR@@')).toBeNull();
  });
});
