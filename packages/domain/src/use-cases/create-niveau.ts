import type { NiveauRepository } from '../ports/niveau-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { niveauInputSchema, type NiveauInput } from '../schemas/niveau';
import {
  NIVEAU_ID_PREFIX,
  type Niveau,
  type NiveauCategory,
  type NiveauId,
} from '../entities/niveau';
import { DuplicateNiveauCodeError } from '../errors/niveau-errors';

export type CreateNiveauInput = NiveauInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Niveau for a center. Gated by `core.niveaux` (present on every
 * plan; the guard is still explicit so the check has one home). Validates its
 * input with the shared `niveauInputSchema` — the domain is the authority even
 * though the form validates first. When a `code` is supplied it must be unique
 * per center among live niveaux: the guard consults `findByCode` and rejects a
 * clash with a typed {@link DuplicateNiveauCodeError}. An absent/blank code
 * normalizes to `null` (no code), and any number of niveaux may have no code.
 * A new niveau is `active`.
 */
export class CreateNiveau {
  constructor(
    private readonly niveaux: NiveauRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateNiveauInput): Promise<Niveau> {
    this.plan.require('core.niveaux');
    const { name, code, category } = niveauInputSchema.parse({
      name: input.name,
      code: input.code,
      category: input.category,
    });

    const normalizedCode = code ?? null;
    if (normalizedCode !== null) {
      const clash = await this.niveaux.findByCode(input.centerCode, normalizedCode);
      if (clash !== null) {
        throw new DuplicateNiveauCodeError(normalizedCode);
      }
    }

    const niveau: Niveau = {
      id: this.ids.next(NIVEAU_ID_PREFIX) as NiveauId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      name,
      code: normalizedCode,
      category: category as NiveauCategory,
      active: true,
    };

    await this.niveaux.save(niveau);
    return niveau;
  }
}
