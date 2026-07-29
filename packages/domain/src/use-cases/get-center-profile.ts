import type { CenterRepository } from '../ports/center-repository';
import type { Center } from '../entities/center';

/**
 * Reads the center profile for display in Settings and on the invoice header.
 * Returns null before the profile has ever been saved (fresh install / first
 * run). Every-plan feature, so no plan gate.
 */
export class GetCenterProfile {
  constructor(private readonly centers: CenterRepository) {}

  execute(): Promise<Center | null> {
    return this.centers.get();
  }
}
