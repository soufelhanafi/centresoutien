import type { SecureRandom } from '../../../src/ports/secure-random';

export function fakeSecureRandom(): SecureRandom {
  return {
    bytes: (count: number) => new Uint8Array(count),
    hex: (count: number) => 'aabbccddeeff0011'.slice(0, count * 2),
  };
}
