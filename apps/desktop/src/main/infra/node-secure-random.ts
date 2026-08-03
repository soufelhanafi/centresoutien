import type { SecureRandom } from '@centresoutien/domain';
import { randomBytes } from 'crypto';

export class NodeSecureRandom implements SecureRandom {
  bytes(count: number): Uint8Array {
    return randomBytes(count);
  }

  hex(count: number): string {
    return randomBytes(count).toString('hex');
  }
}
