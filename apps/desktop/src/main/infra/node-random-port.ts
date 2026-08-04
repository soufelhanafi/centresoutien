import type { RandomPort } from '@centresoutien/domain';
import { randomInt } from 'crypto';

export class NodeRandomPort implements RandomPort {
  nextInt(boundExclusive: number): number {
    return randomInt(boundExclusive);
  }
}
